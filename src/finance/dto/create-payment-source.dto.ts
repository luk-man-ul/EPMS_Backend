import {
  IsString,
  IsOptional,
  IsEnum,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentSourceType } from '@prisma/client';

export class CreatePaymentSourceDto {
  @ApiProperty({
    example: 'SBI Savings Account',
    description: 'Display name for this payment method (must be unique per type)',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: PaymentSourceType,
    example: 'BANK_ACCOUNT',
    description: 'Type of payment source',
  })
  @IsEnum(PaymentSourceType)
  type: PaymentSourceType;

  @ApiPropertyOptional({
    example: 'SBI-001-SAVINGS',
    description: 'Account number — required for BANK_ACCOUNT type, optional for others',
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.type === PaymentSourceType.BANK_ACCOUNT)
  @IsNotEmpty({ message: 'accountNumber is required for BANK_ACCOUNT type' })
  accountNumber?: string;

  @ApiPropertyOptional({
    example: 'State Bank of India',
    description: 'Bank name — relevant for BANK_ACCOUNT type',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({
    example: 'SBIN0000001',
    description: 'IFSC code — relevant for BANK_ACCOUNT type',
  })
  @IsOptional()
  @IsString()
  ifscCode?: string;
}
