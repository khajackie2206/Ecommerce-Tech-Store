import {IsBoolean, IsNotEmpty, IsString, IsOptional, IsUrl, Matches, MaxLength} from "class-validator";

export class CreateBrandDto {

    @IsString({message: "brand name must be a string"})
    @IsNotEmpty({message: "brand name is required"})
    @MaxLength(100, {message: "brand name must be less than 100 characters"})
    name: string;

    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {message: "brand slug must be a valid slug"})
    @MaxLength(120, {message: "brand slug must be less than 120 characters"})
    slug: string;

    @IsOptional()
    @IsUrl({}, { message: 'logoUrl must be a valid URL' })
    @MaxLength(255, { message: 'logoUrl must be less than 255 characters' })
    logoUrl?: string;
    
    @IsOptional()
    @IsBoolean({message: "isActive must be a boolean"})
    isActive: boolean;
}
    