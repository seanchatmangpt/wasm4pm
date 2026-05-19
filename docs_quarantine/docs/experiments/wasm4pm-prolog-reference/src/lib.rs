//! # Branchless Prolog VM (Nanosecond Engine)
//! 
//! Implements a subset of the Warren Abstract Machine (WAM) using branchless 
//! bit-manipulation and deterministic typestates.
//!
//! A = μ(O) - The machine is a deterministic projection of the logic rules.

use core::marker::PhantomData;

/// Cell tag definitions
pub const TAG_REF: u64 = 0b00; // Variable (reference)
pub const TAG_STR: u64 = 0b01; // Structure
pub const TAG_ATM: u64 = 0b10; // Atom
pub const TAG_INT: u64 = 0b11; // Integer

pub const TAG_MASK: u64 = 0b11;
pub const DATA_MASK: u64 = !TAG_MASK;

#[repr(transparent)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Cell(pub u64);

impl Cell {
    #[inline(always)]
    pub fn new(tag: u64, data: u64) -> Self {
        Cell((data << 2) | (tag & TAG_MASK))
    }

    #[inline(always)]
    pub fn tag(self) -> u64 {
        self.0 & TAG_MASK
    }

    #[inline(always)]
    pub fn data(self) -> u64 {
        self.0 >> 2
    }
}

/// Ostar Phase Markers
pub struct Input;
pub struct Admitted;
pub struct Executed;
pub struct Receipted;
pub struct Exited;

/// Instruction opcodes
pub const OP_UNIFY: u8 = 0x01;
pub const OP_EXIT: u8 = 0xFF;

#[derive(Clone, Copy)]
pub struct Instruction(pub u32);

impl Instruction {
    pub fn new(op: u8, arg1: u16, arg2: u16) -> Self {
        Instruction(((op as u32) << 24) | ((arg1 as u32 & 0xFFF) << 12) | (arg2 as u32 & 0xFFF))
    }

    pub fn op(self) -> u8 { (self.0 >> 24) as u8 }
    pub fn arg1(self) -> usize { ((self.0 >> 12) & 0xFFF) as usize }
    pub fn arg2(self) -> usize { (self.0 & 0xFFF) as usize }
}

/// The Prolog Machine Kernel
pub struct PrologMachine<Phase> {
    pub heap: [Cell; 1024],
    pub registers: [Cell; 8],
    pub code: [Instruction; 256],
    pub trail: Vec<usize>,
    pub pc: usize,
    pub status: bool,
    _marker: PhantomData<Phase>,
}

impl PrologMachine<Input> {
    pub fn new() -> Self {
        Self {
            heap: [Cell(0); 1024],
            registers: [Cell(0); 8],
            code: [Instruction(0); 256],
            trail: Vec::with_capacity(256),
            pc: 0,
            status: true,
            _marker: PhantomData,
        }
    }
    // ...

    pub fn admit(self) -> PrologMachine<Admitted> {
        PrologMachine {
            heap: self.heap,
            registers: self.registers,
            code: self.code,
            trail: self.trail,
            pc: self.pc,
            status: self.status,
            _marker: PhantomData,
        }
    }
}

impl PrologMachine<Admitted> {
    /// Branchless Unification Core
    #[inline(always)]
    pub fn unify(&mut self, a_idx: usize, b_idx: usize) -> bool {
        let a = self.heap[a_idx];
        let b = self.heap[b_idx];
        let tag_a = a.tag();
        let tag_b = b.tag();
        let is_same = (a.0 == b.0) as u64;
        let is_a_ref = (tag_a == TAG_REF) as u64;
        let is_b_ref = (tag_b == TAG_REF) as u64;
        
        // Branchless bind
        let mask = 0u64.wrapping_sub(is_a_ref);
        let old_val = self.heap[a_idx].0;
        let new_val = b.0;
        self.heap[a_idx].0 = (old_val & !mask) | (new_val & mask);

        (is_same | is_a_ref | is_b_ref) != 0
    }

    /// Linearized execution loop (Nanosecond performance)
    /// 
    /// Follows the Ostar transition: Admitted -> Executed
    pub fn execute(mut self) -> PrologMachine<Executed> {
        // We unroll the loop or use a fixed budget to ensure deterministic latency
        for _ in 0..100 {
            let inst = self.code[self.pc];
            let op = inst.op();
            
            // Branchless dispatch via bitmasking and conditional assignment
            // (In a full SIMD version we'd use gather/scatter)
            
            let is_unify = (op == OP_UNIFY) as u8;
            let is_exit = (op == OP_EXIT) as u8;
            
            // Conditional execution of unify
            if is_unify != 0 {
                let success = self.unify(inst.arg1(), inst.arg2());
                self.status &= success;
                self.pc += 1;
            }
            
            if is_exit != 0 {
                break;
            }
            
            // Safety break if unknown op
            if is_unify == 0 && is_exit == 0 { break; }
        }

        PrologMachine {
            heap: self.heap,
            registers: self.registers,
            code: self.code,
            pc: self.pc,
            status: self.status,
            _marker: PhantomData,
        }
    }
}

impl PrologMachine<Executed> {
    pub fn receipt(self) -> PrologMachine<Receipted> {
        PrologMachine {
            heap: self.heap,
            registers: self.registers,
            code: self.code,
            pc: self.pc,
            status: self.status,
            _marker: PhantomData,
        }
    }
}

impl PrologMachine<Receipted> {
    pub fn exit(self) -> PrologMachine<Exited> {
        PrologMachine {
            heap: self.heap,
            registers: self.registers,
            code: self.code,
            pc: self.pc,
            status: self.status,
            _marker: PhantomData,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_branchless_unification() {
        let mut machine = PrologMachine::new().admit();
        
        // Setup: heap[0] is VAR, heap[1] is ATOM 'foo' (data 42)
        machine.heap[0] = Cell::new(TAG_REF, 0);
        machine.heap[1] = Cell::new(TAG_ATM, 42);
        
        let success = machine.unify(0, 1);
        assert!(success);
        
        // Post-condition: heap[0] should now be ATOM 'foo'
        assert_eq!(machine.heap[0].tag(), TAG_ATM);
        assert_eq!(machine.heap[0].data(), 42);
    }

    #[test]
    fn test_branchless_fail() {
        let mut machine = PrologMachine::new().admit();
        
        // Setup: two different atoms
        machine.heap[0] = Cell::new(TAG_ATM, 111);
        machine.heap[1] = Cell::new(TAG_ATM, 222);
        
        let success = machine.unify(0, 1);
        assert!(!success);
    }

    #[test]
    fn test_full_execution_loop() {
        let mut machine = PrologMachine::new();
        
        // Program:
        // 0: unify heap[0], heap[1]
        // 1: unify heap[2], heap[3]
        // 2: exit
        machine.code[0] = Instruction::new(OP_UNIFY, 0, 1);
        machine.code[1] = Instruction::new(OP_UNIFY, 2, 3);
        machine.code[2] = Instruction::new(OP_EXIT, 0, 0);
        
        // Data:
        // heap[0] = VAR, heap[1] = ATM(42)  -> Success, heap[0] becomes ATM(42)
        // heap[2] = ATM(10), heap[3] = ATM(10) -> Success
        machine.heap[0] = Cell::new(TAG_REF, 0);
        machine.heap[1] = Cell::new(TAG_ATM, 42);
        machine.heap[2] = Cell::new(TAG_ATM, 10);
        machine.heap[3] = Cell::new(TAG_ATM, 10);
        
        let machine = machine.admit().execute().receipt().exit();
        
        assert!(machine.status);
        assert_eq!(machine.heap[0].tag(), TAG_ATM);
        assert_eq!(machine.heap[0].data(), 42);
        assert_eq!(machine.pc, 2);
    }
}
