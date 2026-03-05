import { IsString, MinLength, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'

export class RejectSelfWorkDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @Transform(({ value }) => {
    // Basic XSS sanitization: strip HTML tags and encode special characters
    if (typeof value === 'string') {
      return value
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '') // Remove any remaining angle brackets
        .trim()
    }
    return value
  })
  reason: string
}
