# Explanation: Object-Centric Process Mining (OCPM)

**Time to read**: 15 minutes  
**Level**: Advanced  

## Traditional Process Mining

Assumes single object type:

```
Case-1:  A → B → C → End
Case-2:  A → C → B → End
Case-3:  A → B → C → End

Model: A → B → C (deterministic)
```

Works for simple processes (loan applications, order processing).

## Object-Centric Process Mining

Tracks **multiple interacting objects**:

```
Order-1:
  ├── Submitted (Item-A, Item-B)
  └── Shipped (Item-A, Item-B)

Item-A:
  ├── Ordered
  ├── Packed
  └── Shipped

Item-B:
  ├── Ordered
  ├── Backordered
  ├── Picked
  └── Shipped

Customer-1:
  ├── Registered
  └── Paid
```

## OCEL Format (Object-Centric Event Log)

wasm4pm supports OCEL (OCEL 2.0):

```json
{
  "ocel:version": "2.0",
  "ocel:events": [
    {
      "ocel:id": "e1",
      "ocel:type": "Ordered",
      "ocel:timestamp": "2026-01-01T08:00:00Z",
      "ocel:omap": [
        {"ocel:object-id": "O1", "ocel:object-type": "Order"},
        {"ocel:object-id": "C1", "ocel:object-type": "Customer"},
        {"ocel:object-id": "I1", "ocel:object-type": "Item"},
        {"ocel:object-id": "I2", "ocel:object-type": "Item"}
      ]
    }
  ]
}
```

## Object Interaction Graph

Instead of single process:

```
Traditional:
A → B → C

OCPM (Order):
A → B → C (Submit → Process → Ship)

OCPM (Item):
A → B → C (Pick → Pack → Ship)

OCPM (Combined):
       Order
      /  |  \
   Item1 | Item2
     |   |   |
   Pick/Pack/Ship (parallel)
```

## Configuration for OCPM

```toml
[discovery]
algorithm = "dfg"
multi_object = true

[source]
format = "ocel"  # OCEL format
path = "orders.ocel.json"

[discovery.object_types]
Order = true
Item = true
Customer = true
```

## Benefits of OCPM

| Aspect | Traditional | OCPM |
|--------|-----------|------|
| Single object type | ✓ | Works but limited |
| Multiple objects | ✗ | ✓ Direct support |
| Parallelism | Implicit | Explicit |
| Relationships | Lost | Preserved |
| E-commerce orders | Poor | Excellent |
| Manufacturing | Poor | Excellent |
| Healthcare | Poor | Excellent |

## Real-World Examples

### E-Commerce Order

Objects: Order, Item, Customer, Warehouse

```
1. Customer registers
2. Customer places order (Order, Items)
3. Items packed (parallel per item)
4. Items shipped (parallel per item)
5. Customer receives (Order complete)
```

Traditional PM: Can't model item-level parallelism
OCPM: Models each item's path + order coordination

### Hospital Admission

Objects: Patient, Appointment, Lab Test, Doctor

```
1. Patient checks in
2. Appointment created
3. Lab tests scheduled (parallel)
4. Doctor reviews results
5. Treatment prescribed
6. Patient discharged
```

Traditional PM: Linear sequence lost (parallelism)
OCPM: Shows per-object and interaction flows

### Manufacturing

Objects: Product, Order, Machine, Worker

```
1. Order created (Product assigned)
2. Products processed (machine-specific)
3. Quality check (parallel per product)
4. Packaging (batch operation)
5. Shipping (bulk operation)
```

## OCPM Algorithms

wasm4pm implements OCPM variants of:

- **DFG-OCPM** (Fast)
- **Heuristic-OCPM** (Balanced)
- **Inductive-OCPM** (Quality)

## Output Format

OCPM model structure:

```json
{
  "type": "ocpm",
  "object_types": [
    {
      "name": "Order",
      "nodes": 8,
      "edges": 12
    },
    {
      "name": "Item",
      "nodes": 6,
      "edges": 9
    }
  ],
  "interactions": [
    {
      "source_type": "Order",
      "target_type": "Item",
      "interactions": 42
    }
  ]
}
```

## See Also

- [How-To: Choose Algorithm](../how-to/choose-algorithm.md)
- [Reference: Config Schema](../reference/config-schema.md)
- [Explanation: Streaming](./streaming.md)
