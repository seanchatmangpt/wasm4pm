use crate::event_log::EventLog;
use crate::import::xes::stream_xes::XESParsingTraceStream;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::BufRead;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct XESImportOptions {
    pub date_format: Option<String>,
    pub verbose: bool,
    pub sort_events_with_timestamp_key: Option<String>,
    pub ignore_event_attributes_except: Option<HashSet<String>>,
    pub ignore_trace_attributes_except: Option<HashSet<String>>,
    pub ignore_log_attributes_except: Option<HashSet<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum XESParseError {
    IOError(String),
    XMLParsingError(String),
    NoTopLevelLog,
    InvalidKeyValue(&'static str),
    MissingKey(&'static str),
    ExpectedLogData,
    ExpectedTraceData,
    AttributeOutsideLog,
    MissingLastTrace,
    MissingLastEvent,
    InvalidMode,
}

impl From<std::io::Error> for XESParseError {
    fn from(e: std::io::Error) -> Self {
        XESParseError::IOError(e.to_string())
    }
}

pub fn import_xes<'a, R: BufRead + 'a>(
    reader: R,
    options: XESImportOptions,
) -> Result<EventLog, XESParseError> {
    let buf_read: Box<dyn BufRead + 'a> = Box::new(reader);
    let reader = quick_xml::Reader::from_reader(buf_read);
    let (mut stream, log_data) = XESParsingTraceStream::try_new(Box::new(reader), options)?;

    let mut traces = Vec::new();
    for trace in &mut stream {
        traces.push(trace);
    }

    if let Some(err) = stream.error {
        return Err(err);
    }

    Ok(EventLog {
        attributes: log_data.log_attributes,
        traces,
        extensions: Some(log_data.extensions),
        classifiers: Some(log_data.classifiers),
        global_trace_attrs: Some(log_data.global_trace_attrs),
        global_event_attrs: Some(log_data.global_event_attrs),
    })
}
