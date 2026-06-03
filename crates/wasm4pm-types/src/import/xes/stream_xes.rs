use crate::event_log::{
    Attribute, AttributeValue, Attributes, Event, EventLogClassifier, EventLogExtension, Trace,
    XESEditableAttribute,
};
use crate::import::timestamp_utils::parse_timestamp;
use crate::import::xes::import_xes::{XESImportOptions, XESParseError};
use quick_xml::{escape::unescape, events::BytesStart, Reader};
use serde::{Deserialize, Serialize};
use std::{fmt::Debug, io::BufRead, str::FromStr};
use uuid::Uuid;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct XESOuterLogData {
    pub xes_version: Option<String>,
    pub extensions: Vec<EventLogExtension>,
    pub classifiers: Vec<EventLogClassifier>,
    pub log_attributes: Attributes,
    pub global_trace_attrs: Attributes,
    pub global_event_attrs: Attributes,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum Mode {
    Trace,
    Event,
    Attribute,
    GlobalTraceAttributes,
    GlobalEventAttributes,
    Log,
    None,
}

use crate::import::persistence::IngestionKnowledgeBase;

pub struct StreamingXESParser<'a> {
    reader: Box<Reader<Box<dyn BufRead + 'a>>>,
    buf: Vec<u8>,
    current_mode: Mode,
    current_trace: Option<Trace>,
    last_mode_before_attr: Mode,
    current_nested_attributes: Vec<Attribute>,
    options: XESImportOptions,
    encountered_log: bool,
    log_data: XESOuterLogData,
    log_data_emitted: bool,
    finished: bool,
    pub knowledge_base: IngestionKnowledgeBase,
}

impl Debug for StreamingXESParser<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StreamingXESParser")
            .field("current_mode", &self.current_mode)
            .field("encountered_log", &self.encountered_log)
            .field("log_data_emitted", &self.log_data_emitted)
            .field("finished", &self.finished)
            .finish()
    }
}

#[derive(Debug)]
pub enum XESNextStreamElement {
    LogData(XESOuterLogData),
    Trace(Trace),
    Error(XESParseError),
}

/// Context for attribute parsing to avoid too-many-arguments clippy lint
pub struct XESAttributeContext<'a> {
    pub current_mode: &'a mut Mode,
    pub current_trace: &'a mut Option<Trace>,
    pub log_data: &'a mut XESOuterLogData,
    pub current_nested_attributes: &'a mut Vec<Attribute>,
    pub options: &'a XESImportOptions,
    pub knowledge_base: &'a IngestionKnowledgeBase,
    pub last_mode_before_attr: &'a mut Mode,
}

impl StreamingXESParser<'_> {
    pub fn next_trace(&mut self) -> Option<XESNextStreamElement> {
        if self.finished {
            return None;
        }
        self.reader.config_mut().trim_text(true);

        loop {
            match self.reader.read_event_into(&mut self.buf) {
                Ok(r) => {
                    match r {
                        quick_xml::events::Event::Start(t) => match t.name().as_ref() {
                            b"trace" => {
                                self.current_mode = Mode::Trace;
                                self.current_trace = Some(Trace {
                                    attributes: Vec::with_capacity(10),
                                    events: Vec::with_capacity(10),
                                });
                                if !self.log_data_emitted {
                                    self.log_data_emitted = true;
                                    return Some(XESNextStreamElement::LogData(
                                        self.log_data.clone(),
                                    ));
                                }
                            }
                            b"event" => {
                                self.current_mode = Mode::Event;
                                if let Some(t) = &mut self.current_trace {
                                    t.events.push(Event {
                                        attributes: Vec::with_capacity(10),
                                    });
                                }
                            }
                            b"global" => match t.try_get_attribute("scope") {
                                Ok(Some(a)) => match a.value.as_ref() {
                                    b"trace" => self.current_mode = Mode::GlobalTraceAttributes,
                                    b"event" => self.current_mode = Mode::GlobalEventAttributes,
                                    _ => {
                                        return self.error(XESParseError::InvalidKeyValue("scope"))
                                    }
                                },
                                Ok(None) => return self.error(XESParseError::MissingKey("scope")),
                                Err(e) => {
                                    return self
                                        .error(XESParseError::XMLParsingError(e.to_string()))
                                }
                            },
                            b"log" => {
                                self.log_data.xes_version = get_attribute_string(&t, "xes.version");
                                self.encountered_log = true;
                                self.current_mode = Mode::Log;
                            }
                            b"extension" => {
                                self.log_data.extensions.push(EventLogExtension {
                                    name: get_attribute_string(&t, "name").unwrap_or_default(),
                                    prefix: get_attribute_string(&t, "prefix").unwrap_or_default(),
                                    uri: get_attribute_string(&t, "uri").unwrap_or_default(),
                                });
                            }
                            b"classifier" => {
                                self.log_data.classifiers.push(EventLogClassifier {
                                    name: get_attribute_string(&t, "name").unwrap_or_default(),
                                    keys: parse_classifier_key(
                                        get_attribute_string(&t, "keys").unwrap_or_default(),
                                        &self.log_data,
                                    ),
                                });
                            }
                            _ => {
                                if !self.encountered_log {
                                    return self.error(XESParseError::NoTopLevelLog);
                                }
                                let mut ctx = XESAttributeContext {
                                    current_mode: &mut self.current_mode,
                                    current_trace: &mut self.current_trace,
                                    log_data: &mut self.log_data,
                                    current_nested_attributes: &mut self.current_nested_attributes,
                                    options: &self.options,
                                    knowledge_base: &self.knowledge_base,
                                    last_mode_before_attr: &mut self.last_mode_before_attr,
                                };
                                StreamingXESParser::parse_attributes(&mut ctx, &t);
                            }
                        },
                        quick_xml::events::Event::Empty(t) => match t.name().as_ref() {
                            b"extension" | b"classifier" => {
                                /* handled in Start if needed, but Empty is common */
                                if t.name().as_ref() == b"extension" {
                                    self.log_data.extensions.push(EventLogExtension {
                                        name: get_attribute_string(&t, "name").unwrap_or_default(),
                                        prefix: get_attribute_string(&t, "prefix")
                                            .unwrap_or_default(),
                                        uri: get_attribute_string(&t, "uri").unwrap_or_default(),
                                    });
                                } else {
                                    self.log_data.classifiers.push(EventLogClassifier {
                                        name: get_attribute_string(&t, "name").unwrap_or_default(),
                                        keys: parse_classifier_key(
                                            get_attribute_string(&t, "keys").unwrap_or_default(),
                                            &self.log_data,
                                        ),
                                    });
                                }
                            }
                            b"log" => {
                                self.encountered_log = true;
                                if !self.log_data_emitted {
                                    self.log_data_emitted = true;
                                    return Some(XESNextStreamElement::LogData(
                                        self.log_data.clone(),
                                    ));
                                }
                            }
                            b"trace" => {
                                return self.emit_trace();
                            }
                            _ => {
                                if !self.encountered_log {
                                    return self.error(XESParseError::NoTopLevelLog);
                                }
                                let mut ctx = XESAttributeContext {
                                    current_mode: &mut self.current_mode,
                                    current_trace: &mut self.current_trace,
                                    log_data: &mut self.log_data,
                                    current_nested_attributes: &mut self.current_nested_attributes,
                                    options: &self.options,
                                    knowledge_base: &self.knowledge_base,
                                    last_mode_before_attr: &mut self.last_mode_before_attr,
                                };
                                if !StreamingXESParser::add_attribute_from_tag(&mut ctx, &t) {
                                    return self.error(XESParseError::AttributeOutsideLog);
                                }
                            }
                        },
                        quick_xml::events::Event::End(t) => match t.as_ref() {
                            b"event" => self.current_mode = Mode::Trace,
                            b"trace" => {
                                self.current_mode = Mode::Log;
                                return self.emit_trace();
                            }
                            b"log" => self.current_mode = Mode::None,
                            b"global" => self.current_mode = Mode::Log,
                            _ => {
                                if matches!(self.current_mode, Mode::Attribute) {
                                    if let Some(attr) = self.current_nested_attributes.pop() {
                                        if let Some(parent) =
                                            self.current_nested_attributes.last_mut()
                                        {
                                            match &mut parent.value {
                                                AttributeValue::List(l)
                                                | AttributeValue::Container(l) => l.push(attr),
                                                _ => {
                                                    if parent.own_attributes.is_none() {
                                                        parent.own_attributes = Some(Vec::new());
                                                    }
                                                    parent
                                                        .own_attributes
                                                        .as_mut()
                                                        .unwrap()
                                                        .push(attr);
                                                }
                                            }
                                        } else {
                                            match self.last_mode_before_attr {
                                                Mode::Trace => {
                                                    if let Some(tr) = &mut self.current_trace {
                                                        tr.attributes.push(attr);
                                                    }
                                                }
                                                Mode::Event => {
                                                    if let Some(tr) = &mut self.current_trace {
                                                        if let Some(ev) = tr.events.last_mut() {
                                                            ev.attributes.push(attr);
                                                        }
                                                    }
                                                }
                                                Mode::Log => {
                                                    self.log_data.log_attributes.push(attr)
                                                }
                                                Mode::GlobalTraceAttributes => {
                                                    self.log_data.global_trace_attrs.push(attr)
                                                }
                                                Mode::GlobalEventAttributes => {
                                                    self.log_data.global_event_attrs.push(attr)
                                                }
                                                _ => {}
                                            }
                                            self.current_mode = self.last_mode_before_attr;
                                        }
                                    }
                                }
                            }
                        },
                        quick_xml::events::Event::Eof => {
                            if !self.encountered_log {
                                return self.error(XESParseError::NoTopLevelLog);
                            }
                            if !self.log_data_emitted {
                                self.log_data_emitted = true;
                                return Some(XESNextStreamElement::LogData(self.log_data.clone()));
                            }
                            self.finished = true;
                            return None;
                        }
                        _ => {}
                    }
                }
                Err(e) => return self.error(XESParseError::XMLParsingError(e.to_string())),
            }
            self.buf.clear();
        }
    }

    fn error(&mut self, e: XESParseError) -> Option<XESNextStreamElement> {
        self.finished = true;
        Some(XESNextStreamElement::Error(e))
    }

    fn emit_trace(&mut self) -> Option<XESNextStreamElement> {
        if let Some(mut trace) = self.current_trace.take() {
            // Sort events if requested
            if let Some(ts_key) = &self.options.sort_events_with_timestamp_key {
                trace.events.sort_by_key(|e| {
                    e.attributes
                        .get_by_key(ts_key)
                        .and_then(|a| match &a.value {
                            AttributeValue::Date(d) => Some(*d),
                            _ => None,
                        })
                });
            }
            return Some(XESNextStreamElement::Trace(trace));
        }
        self.error(XESParseError::MissingLastTrace)
    }

    fn parse_attributes(ctx: &mut XESAttributeContext<'_>, t: &BytesStart<'_>) {
        let key = get_attribute_string(t, "key").unwrap_or_default();
        if !should_ignore_attribute(ctx.options, ctx.knowledge_base, ctx.current_mode, &key) {
            let value = parse_attribute_value_from_tag(t, ctx.current_mode, ctx.options);
            if !(key.is_empty() && matches!(value, AttributeValue::None())) {
                ctx.current_nested_attributes.push(Attribute {
                    key,
                    value,
                    own_attributes: None,
                });
                if !matches!(ctx.current_mode, Mode::Attribute) {
                    *ctx.last_mode_before_attr = *ctx.current_mode;
                }
                *ctx.current_mode = Mode::Attribute;
            }
        }
    }

    fn add_attribute_from_tag(ctx: &mut XESAttributeContext<'_>, t: &BytesStart<'_>) -> bool {
        let key = get_attribute_string(t, "key").unwrap_or_default();
        if should_ignore_attribute(ctx.options, ctx.knowledge_base, ctx.current_mode, &key) {
            return true;
        }
        let val = parse_attribute_value_from_tag(t, ctx.current_mode, ctx.options);
        match ctx.current_mode {
            Mode::Trace => {
                if let Some(tr) = ctx.current_trace {
                    tr.attributes.add_to_attributes(key, val);
                }
            }
            Mode::Event => {
                if let Some(tr) = ctx.current_trace {
                    if let Some(ev) = tr.events.last_mut() {
                        ev.attributes.add_to_attributes(key, val);
                    }
                }
            }
            Mode::Log => ctx.log_data.log_attributes.add_to_attributes(key, val),
            Mode::GlobalTraceAttributes => {
                ctx.log_data.global_trace_attrs.add_to_attributes(key, val)
            }
            Mode::GlobalEventAttributes => {
                ctx.log_data.global_event_attrs.add_to_attributes(key, val)
            }
            Mode::Attribute => {
                if let Some(parent) = ctx.current_nested_attributes.last_mut() {
                    match &mut parent.value {
                        AttributeValue::List(l) | AttributeValue::Container(l) => {
                            l.push(Attribute::new(key, val))
                        }
                        _ => {
                            if parent.own_attributes.is_none() {
                                parent.own_attributes = Some(Vec::new());
                            }
                            parent
                                .own_attributes
                                .as_mut()
                                .unwrap()
                                .push(Attribute::new(key, val));
                        }
                    }
                }
            }
            Mode::None => return false,
        }
        true
    }
}

pub struct XESParsingTraceStream<'a> {
    inner: StreamingXESParser<'a>,
    pub error: Option<XESParseError>,
}

impl Iterator for &mut XESParsingTraceStream<'_> {
    type Item = Trace;
    fn next(&mut self) -> Option<Self::Item> {
        if self.error.is_some() {
            return None;
        }
        match self.inner.next_trace() {
            Some(XESNextStreamElement::Trace(t)) => Some(t),
            Some(XESNextStreamElement::Error(e)) => {
                self.error = Some(e);
                None
            }
            _ => None,
        }
    }
}

impl XESParsingTraceStream<'_> {
    pub fn try_new<'a>(
        reader: Box<Reader<Box<dyn BufRead + 'a>>>,
        options: XESImportOptions,
    ) -> Result<(XESParsingTraceStream<'a>, XESOuterLogData), XESParseError> {
        let mut s = StreamingXESParser {
            reader,
            buf: Vec::new(),
            current_mode: Mode::Log,
            current_trace: None,
            last_mode_before_attr: Mode::Log,
            current_nested_attributes: Vec::new(),
            options,
            encountered_log: false,
            log_data: XESOuterLogData::default(),
            log_data_emitted: false,
            finished: false,
            knowledge_base: IngestionKnowledgeBase::default(),
        };
        match s.next_trace() {
            Some(XESNextStreamElement::LogData(d)) => Ok((
                XESParsingTraceStream {
                    inner: s,
                    error: None,
                },
                d,
            )),
            Some(XESNextStreamElement::Error(e)) => Err(e),
            _ => Err(XESParseError::ExpectedLogData),
        }
    }
}

fn get_attribute_string(t: &BytesStart<'_>, key: &str) -> Option<String> {
    t.try_get_attribute(key).ok().flatten().map(|a| {
        unescape(&String::from_utf8_lossy(&a.value))
            .unwrap_or_else(|_| String::from_utf8_lossy(&a.value))
            .into_owned()
    })
}

fn parse_attribute_value_from_tag(
    t: &BytesStart<'_>,
    _mode: &Mode,
    options: &XESImportOptions,
) -> AttributeValue {
    match t.name().as_ref() {
        b"container" => AttributeValue::Container(Vec::new()),
        b"list" => AttributeValue::List(Vec::new()),
        _ => {
            if let Some(value) = get_attribute_string(t, "value") {
                match t.name().as_ref() {
                    b"string" => AttributeValue::String(value),
                    b"date" => match parse_timestamp(
                        &value,
                        options.date_format.as_deref(),
                        options.verbose,
                    ) {
                        Ok(dt) => AttributeValue::Date(dt),
                        Err(_) => AttributeValue::None(),
                    },
                    b"int" => AttributeValue::Int(value.parse().unwrap_or_default()),
                    b"float" => AttributeValue::Float(value.parse().unwrap_or_default()),
                    b"boolean" => AttributeValue::Boolean(value.parse().unwrap_or_default()),
                    b"id" => AttributeValue::ID(Uuid::from_str(&value).unwrap_or_default()),
                    _ => AttributeValue::None(),
                }
            } else {
                AttributeValue::None()
            }
        }
    }
}

fn should_ignore_attribute(
    options: &XESImportOptions,
    knowledge_base: &IngestionKnowledgeBase,
    mode: &Mode,
    key: &str,
) -> bool {
    if knowledge_base.ignored_noise_attributes.contains(key) {
        return true;
    }
    match mode {
        Mode::Event => {
            if let Some(set) = &options.ignore_event_attributes_except {
                return !set.contains(key);
            }
        }
        Mode::Trace => {
            if let Some(set) = &options.ignore_trace_attributes_except {
                return !set.contains(key);
            }
        }
        Mode::Log => {
            if let Some(set) = &options.ignore_log_attributes_except {
                return !set.contains(key);
            }
        }
        _ => {}
    }
    false
}

pub fn parse_classifier_key(t: String, _log_data: &XESOuterLogData) -> Vec<String> {
    t.split(' ').map(|s| s.to_string()).collect()
}
