import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Body accepted by POST /api/v1/auth/register
export class RegisterDto {
  @ApiProperty({ example: 'binh@mail.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email: string;

  @ApiProperty({ example: 'matkhau123' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(100, { message: 'Mật khẩu tối đa 100 ký tự' })
  // (?=.*[A-Za-z]) = "somewhere there is a letter", (?=.*\d) = "somewhere there is a digit"
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có cả chữ và số',
  })
  password: string;

  @ApiProperty({ example: 'Trần Thị Bình' })
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName: string;

  // Vietnamese mobile number: 10 digits starting with 0, e.g. 0901234567
  @ApiProperty({ required: false, example: '0901234567' })
  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0',
  })
  phone?: string;
}
