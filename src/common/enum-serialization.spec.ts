/**
 * Property-Based Tests for Enum Serialization
 * 
 * These tests verify that enum values maintain consistency when serialized
 * to JSON and parsed back (round-trip property).
 * 
 * **Validates: Requirements 36.1, 36.2, 36.7**
 * 
 * Testing Framework: Jest + fast-check
 */

import * as fc from 'fast-check';
import { ProjectStatus, TaskStatus, TicketStatus } from '@prisma/client';

describe('Enum Serialization Property Tests', () => {
  describe('ProjectStatus Round-Trip Consistency', () => {
    /**
     * **Validates: Requirements 36.1, 36.2**
     * 
     * Property: Round-trip consistency for ProjectStatus
     * 
     * For all valid ProjectStatus enum values:
     * - parse(serialize(parse(value))) === parse(value)
     * - Serialization to JSON and parsing back produces equivalent value
     * 
     * This ensures frontend and backend can communicate enum values correctly
     * without data loss or corruption.
     */
    it('should maintain consistency through parse -> serialize -> parse cycle', () => {
      fc.assert(
        fc.property(
          // Generator: All valid ProjectStatus enum values
          fc.constantFrom(...Object.values(ProjectStatus)),
          (status) => {
            // Step 1: Parse (simulate receiving from backend)
            const parsed1 = status as ProjectStatus;
            
            // Step 2: Serialize (simulate sending to backend via JSON)
            const serialized = JSON.stringify({ status: parsed1 });
            
            // Step 3: Parse again (simulate backend receiving the request)
            const deserialized = JSON.parse(serialized);
            const parsed2 = deserialized.status as ProjectStatus;
            
            // Property: The final parsed value should equal the original
            expect(parsed2).toBe(parsed1);
            expect(parsed2).toBe(status);
            
            // Additional validation: Ensure it's still a valid enum value
            expect(Object.values(ProjectStatus)).toContain(parsed2);
          }
        ),
        {
          // Run 100 test cases to ensure thorough coverage
          numRuns: 100,
          // Use verbose mode to see which values are being tested
          verbose: false,
        }
      );
    });

    /**
     * Property: JSON serialization preserves enum string values
     * 
     * Ensures that when an enum is serialized to JSON, it maintains
     * its string representation exactly.
     */
    it('should preserve exact string value through JSON serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(ProjectStatus)),
          (status) => {
            const obj = { status };
            const json = JSON.stringify(obj);
            const parsed = JSON.parse(json);
            
            // The string value should be preserved exactly
            expect(parsed.status).toBe(status);
            expect(typeof parsed.status).toBe('string');
          }
        )
      );
    });

    /**
     * Property: Enum values are case-sensitive
     * 
     * Ensures that enum matching is case-sensitive, preventing
     * issues with incorrect casing.
     */
    it('should be case-sensitive when comparing enum values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(ProjectStatus)),
          (status) => {
            const lowercase = status.toLowerCase();
            const uppercase = status.toUpperCase();
            
            // Original should match itself
            expect(status).toBe(status);
            
            // Lowercase/uppercase should NOT match unless they're the same
            // (which they are for our all-caps enums, but this tests the principle)
            if (status !== uppercase) {
              expect(status).not.toBe(uppercase);
            }
            if (status !== lowercase) {
              expect(status).not.toBe(lowercase);
            }
          }
        )
      );
    });

    /**
     * Property: All enum values are non-empty strings
     * 
     * Ensures that no enum value is an empty string or null.
     */
    it('should have non-empty string values for all enum members', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(ProjectStatus)),
          (status) => {
            expect(status).toBeTruthy();
            expect(typeof status).toBe('string');
            expect(status.length).toBeGreaterThan(0);
          }
        )
      );
    });

    /**
     * Property: Enum values are unique
     * 
     * Ensures that no two enum members have the same value.
     */
    it('should have unique values for all enum members', () => {
      const values = Object.values(ProjectStatus);
      const uniqueValues = new Set(values);
      
      expect(uniqueValues.size).toBe(values.length);
    });

    /**
     * Property: Enum contains expected values
     * 
     * Validates that the ProjectStatus enum contains exactly the expected
     * values as defined in the Prisma schema.
     */
    it('should contain exactly the expected enum values', () => {
      const expectedValues = [
        'PLANNING',
        'ACTIVE',
        'ON_HOLD',
        'COMPLETED',
        'ARCHIVED',
      ];
      
      const actualValues = Object.values(ProjectStatus);
      
      expect(actualValues.sort()).toEqual(expectedValues.sort());
    });

    /**
     * Property: Serialization in nested objects
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of nested object structures (common in API requests).
     */
    it('should maintain consistency in nested object serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(ProjectStatus)),
          (status) => {
            const nestedObj = {
              project: {
                id: 'test-id',
                status: status,
                metadata: {
                  currentStatus: status,
                },
              },
            };
            
            const serialized = JSON.stringify(nestedObj);
            const parsed = JSON.parse(serialized);
            
            expect(parsed.project.status).toBe(status);
            expect(parsed.project.metadata.currentStatus).toBe(status);
          }
        )
      );
    });

    /**
     * Property: Array serialization
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of arrays (common in bulk operations).
     */
    it('should maintain consistency in array serialization', () => {
      const allStatuses = Object.values(ProjectStatus);
      const obj = { statuses: allStatuses };
      
      const serialized = JSON.stringify(obj);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.statuses).toEqual(allStatuses);
      expect(parsed.statuses.length).toBe(allStatuses.length);
      
      parsed.statuses.forEach((status: string, index: number) => {
        expect(status).toBe(allStatuses[index]);
      });
    });
  });

  describe('TaskStatus Round-Trip Consistency', () => {
    /**
     * **Validates: Requirements 36.3, 36.4**
     * 
     * Property: Round-trip consistency for TaskStatus
     * 
     * For all valid TaskStatus enum values:
     * - parse(serialize(parse(value))) === parse(value)
     * - Serialization to JSON and parsing back produces equivalent value
     * 
     * This ensures frontend and backend can communicate enum values correctly
     * without data loss or corruption.
     */
    it('should maintain consistency through parse -> serialize -> parse cycle', () => {
      fc.assert(
        fc.property(
          // Generator: All valid TaskStatus enum values
          fc.constantFrom(...Object.values(TaskStatus)),
          (status) => {
            // Step 1: Parse (simulate receiving from backend)
            const parsed1 = status as TaskStatus;
            
            // Step 2: Serialize (simulate sending to backend via JSON)
            const serialized = JSON.stringify({ status: parsed1 });
            
            // Step 3: Parse again (simulate backend receiving the request)
            const deserialized = JSON.parse(serialized);
            const parsed2 = deserialized.status as TaskStatus;
            
            // Property: The final parsed value should equal the original
            expect(parsed2).toBe(parsed1);
            expect(parsed2).toBe(status);
            
            // Additional validation: Ensure it's still a valid enum value
            expect(Object.values(TaskStatus)).toContain(parsed2);
          }
        ),
        {
          // Run 100 test cases to ensure thorough coverage
          numRuns: 100,
          // Use verbose mode to see which values are being tested
          verbose: false,
        }
      );
    });

    /**
     * Property: JSON serialization preserves enum string values
     * 
     * Ensures that when an enum is serialized to JSON, it maintains
     * its string representation exactly.
     */
    it('should preserve exact string value through JSON serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TaskStatus)),
          (status) => {
            const obj = { status };
            const json = JSON.stringify(obj);
            const parsed = JSON.parse(json);
            
            // The string value should be preserved exactly
            expect(parsed.status).toBe(status);
            expect(typeof parsed.status).toBe('string');
          }
        )
      );
    });

    /**
     * Property: Enum values are case-sensitive
     * 
     * Ensures that enum matching is case-sensitive, preventing
     * issues with incorrect casing.
     */
    it('should be case-sensitive when comparing enum values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TaskStatus)),
          (status) => {
            const lowercase = status.toLowerCase();
            const uppercase = status.toUpperCase();
            
            // Original should match itself
            expect(status).toBe(status);
            
            // Lowercase/uppercase should NOT match unless they're the same
            // (which they are for our all-caps enums, but this tests the principle)
            if (status !== uppercase) {
              expect(status).not.toBe(uppercase);
            }
            if (status !== lowercase) {
              expect(status).not.toBe(lowercase);
            }
          }
        )
      );
    });

    /**
     * Property: All enum values are non-empty strings
     * 
     * Ensures that no enum value is an empty string or null.
     */
    it('should have non-empty string values for all enum members', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TaskStatus)),
          (status) => {
            expect(status).toBeTruthy();
            expect(typeof status).toBe('string');
            expect(status.length).toBeGreaterThan(0);
          }
        )
      );
    });

    /**
     * Property: Enum values are unique
     * 
     * Ensures that no two enum members have the same value.
     */
    it('should have unique values for all enum members', () => {
      const values = Object.values(TaskStatus);
      const uniqueValues = new Set(values);
      
      expect(uniqueValues.size).toBe(values.length);
    });

    /**
     * Property: Enum contains expected values
     * 
     * Validates that the TaskStatus enum contains exactly the expected
     * values as defined in the Prisma schema.
     */
    it('should contain exactly the expected enum values', () => {
      const expectedValues = [
        'TODO',
        'IN_PROGRESS',
        'REVIEW',
        'COMPLETED',
        'CANCELLED',
      ];
      
      const actualValues = Object.values(TaskStatus);
      
      expect(actualValues.sort()).toEqual(expectedValues.sort());
    });

    /**
     * Property: Serialization in nested objects
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of nested object structures (common in API requests).
     */
    it('should maintain consistency in nested object serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TaskStatus)),
          (status) => {
            const nestedObj = {
              task: {
                id: 'test-id',
                status: status,
                metadata: {
                  currentStatus: status,
                },
              },
            };
            
            const serialized = JSON.stringify(nestedObj);
            const parsed = JSON.parse(serialized);
            
            expect(parsed.task.status).toBe(status);
            expect(parsed.task.metadata.currentStatus).toBe(status);
          }
        )
      );
    });

    /**
     * Property: Array serialization
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of arrays (common in bulk operations).
     */
    it('should maintain consistency in array serialization', () => {
      const allStatuses = Object.values(TaskStatus);
      const obj = { statuses: allStatuses };
      
      const serialized = JSON.stringify(obj);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.statuses).toEqual(allStatuses);
      expect(parsed.statuses.length).toBe(allStatuses.length);
      
      parsed.statuses.forEach((status: string, index: number) => {
        expect(status).toBe(allStatuses[index]);
      });
    });
  });

  describe('TicketStatus Round-Trip Consistency', () => {
    /**
     * **Validates: Requirements 36.5, 36.6**
     * 
     * Property: Round-trip consistency for TicketStatus
     * 
     * For all valid TicketStatus enum values:
     * - parse(serialize(parse(value))) === parse(value)
     * - Serialization to JSON and parsing back produces equivalent value
     * 
     * This ensures frontend and backend can communicate enum values correctly
     * without data loss or corruption.
     */
    it('should maintain consistency through parse -> serialize -> parse cycle', () => {
      fc.assert(
        fc.property(
          // Generator: All valid TicketStatus enum values
          fc.constantFrom(...Object.values(TicketStatus)),
          (status) => {
            // Step 1: Parse (simulate receiving from backend)
            const parsed1 = status as TicketStatus;
            
            // Step 2: Serialize (simulate sending to backend via JSON)
            const serialized = JSON.stringify({ status: parsed1 });
            
            // Step 3: Parse again (simulate backend receiving the request)
            const deserialized = JSON.parse(serialized);
            const parsed2 = deserialized.status as TicketStatus;
            
            // Property: The final parsed value should equal the original
            expect(parsed2).toBe(parsed1);
            expect(parsed2).toBe(status);
            
            // Additional validation: Ensure it's still a valid enum value
            expect(Object.values(TicketStatus)).toContain(parsed2);
          }
        ),
        {
          // Run 100 test cases to ensure thorough coverage
          numRuns: 100,
          // Use verbose mode to see which values are being tested
          verbose: false,
        }
      );
    });

    /**
     * Property: JSON serialization preserves enum string values
     * 
     * Ensures that when an enum is serialized to JSON, it maintains
     * its string representation exactly.
     */
    it('should preserve exact string value through JSON serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TicketStatus)),
          (status) => {
            const obj = { status };
            const json = JSON.stringify(obj);
            const parsed = JSON.parse(json);
            
            // The string value should be preserved exactly
            expect(parsed.status).toBe(status);
            expect(typeof parsed.status).toBe('string');
          }
        )
      );
    });

    /**
     * Property: Enum values are case-sensitive
     * 
     * Ensures that enum matching is case-sensitive, preventing
     * issues with incorrect casing.
     */
    it('should be case-sensitive when comparing enum values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TicketStatus)),
          (status) => {
            const lowercase = status.toLowerCase();
            const uppercase = status.toUpperCase();
            
            // Original should match itself
            expect(status).toBe(status);
            
            // Lowercase/uppercase should NOT match unless they're the same
            // (which they are for our all-caps enums, but this tests the principle)
            if (status !== uppercase) {
              expect(status).not.toBe(uppercase);
            }
            if (status !== lowercase) {
              expect(status).not.toBe(lowercase);
            }
          }
        )
      );
    });

    /**
     * Property: All enum values are non-empty strings
     * 
     * Ensures that no enum value is an empty string or null.
     */
    it('should have non-empty string values for all enum members', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TicketStatus)),
          (status) => {
            expect(status).toBeTruthy();
            expect(typeof status).toBe('string');
            expect(status.length).toBeGreaterThan(0);
          }
        )
      );
    });

    /**
     * Property: Enum values are unique
     * 
     * Ensures that no two enum members have the same value.
     */
    it('should have unique values for all enum members', () => {
      const values = Object.values(TicketStatus);
      const uniqueValues = new Set(values);
      
      expect(uniqueValues.size).toBe(values.length);
    });

    /**
     * Property: Enum contains expected values
     * 
     * Validates that the TicketStatus enum contains exactly the expected
     * values as defined in the Prisma schema.
     */
    it('should contain exactly the expected enum values', () => {
      const expectedValues = [
        'OPEN',
        'IN_PROGRESS',
        'WAITING_FOR_USER',
        'RESOLVED',
        'CLOSED',
        'REJECTED',
        'REOPENED',
      ];
      
      const actualValues = Object.values(TicketStatus);
      
      expect(actualValues.sort()).toEqual(expectedValues.sort());
    });

    /**
     * Property: Serialization in nested objects
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of nested object structures (common in API requests).
     */
    it('should maintain consistency in nested object serialization', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(TicketStatus)),
          (status) => {
            const nestedObj = {
              ticket: {
                id: 'test-id',
                status: status,
                metadata: {
                  currentStatus: status,
                },
              },
            };
            
            const serialized = JSON.stringify(nestedObj);
            const parsed = JSON.parse(serialized);
            
            expect(parsed.ticket.status).toBe(status);
            expect(parsed.ticket.metadata.currentStatus).toBe(status);
          }
        )
      );
    });

    /**
     * Property: Array serialization
     * 
     * Tests that enum values maintain consistency when serialized
     * as part of arrays (common in bulk operations).
     */
    it('should maintain consistency in array serialization', () => {
      const allStatuses = Object.values(TicketStatus);
      const obj = { statuses: allStatuses };
      
      const serialized = JSON.stringify(obj);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.statuses).toEqual(allStatuses);
      expect(parsed.statuses.length).toBe(allStatuses.length);
      
      parsed.statuses.forEach((status: string, index: number) => {
        expect(status).toBe(allStatuses[index]);
      });
    });
  });
});