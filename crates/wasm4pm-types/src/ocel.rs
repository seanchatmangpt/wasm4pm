use crate::event_log::AttributeValue;

pub use ocel_core::{
    OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject, OCELObjectAttribute,
    OCELRelationship, OCELType, OCELTypeAttribute, OCEL,
};

impl From<AttributeValue> for OCELAttributeValue {
    fn from(value: AttributeValue) -> Self {
        match value {
            AttributeValue::String(s) => Self::String(s),
            AttributeValue::Date(date_time) => Self::Time(date_time),
            AttributeValue::Int(i) => Self::Integer(i),
            AttributeValue::Float(f) => Self::Float(f),
            AttributeValue::Boolean(b) => Self::Boolean(b),
            AttributeValue::ID(uuid) => Self::String(uuid.to_string()),
            AttributeValue::List(attributes) => Self::String(format!("{:?}", attributes)),
            AttributeValue::Container(attributes) => Self::String(format!("{:?}", attributes)),
            AttributeValue::None() => Self::Null,
        }
    }
}

impl From<OCELAttributeValue> for AttributeValue {
    fn from(value: OCELAttributeValue) -> AttributeValue {
        match value {
            OCELAttributeValue::String(s) => AttributeValue::String(s),
            OCELAttributeValue::Integer(i) => AttributeValue::Int(i),
            OCELAttributeValue::Float(f) => AttributeValue::Float(f),
            OCELAttributeValue::Boolean(b) => AttributeValue::Boolean(b),
            OCELAttributeValue::Time(date_time) => AttributeValue::Date(date_time),
            OCELAttributeValue::Null => AttributeValue::None(),
        }
    }
}
