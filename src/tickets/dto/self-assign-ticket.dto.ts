// Empty DTO for self-assignment endpoint
// User ID is extracted from JWT token, not from request body
// This ensures employees can only assign tickets to themselves
export class SelfAssignTicketDto {}
