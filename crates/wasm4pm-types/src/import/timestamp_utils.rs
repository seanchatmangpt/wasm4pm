use chrono::{DateTime, FixedOffset, NaiveDateTime};

pub fn parse_timestamp<'a>(
    time: &'a str,
    custom_format: Option<&'a str>,
    _verbose: bool,
) -> Result<DateTime<FixedOffset>, &'a str> {
    if let Some(date_format) = custom_format {
        if let Ok(dt) = DateTime::parse_from_str(time, date_format) {
            return Ok(dt);
        }
        if let Ok(dt) = NaiveDateTime::parse_from_str(time, date_format) {
            return Ok(dt.and_utc().into());
        }
    }

    if let Ok(dt) = DateTime::parse_from_rfc3339(time) {
        return Ok(dt);
    }

    if let Ok(dt) = DateTime::parse_from_str(time, "%Y-%m-%dT%H:%M:%S%z") {
        return Ok(dt);
    }

    if let Ok(dt) = DateTime::parse_from_rfc2822(time) {
        return Ok(dt);
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(time, "%F %T%.f") {
        return Ok(dt.and_utc().into());
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(time, "%FT%T%.f") {
        return Ok(dt.and_utc().into());
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(time, "%FT%T") {
        return Ok(dt.and_utc().into());
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(time, "%F %T UTC") {
        return Ok(dt.and_utc().into());
    }

    if let Ok((dt, _)) = DateTime::parse_and_remainder(time, "%Z %b %d %Y %T GMT%z") {
        return Ok(dt);
    }

    Err("Unexpected timestamp format")
}
