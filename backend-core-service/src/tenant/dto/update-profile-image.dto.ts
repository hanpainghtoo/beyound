import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileImageDto {
  @ApiProperty({
    description: 'Media file ID of the uploaded profile image',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsUUID()
  fileId: string;
}
