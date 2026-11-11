import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreateCategoryDto {
    @IsString({ message: "The category name must be in string format"})
    @IsNotEmpty({ message: "Please enter category name"})
    @MaxLength(100, {message: "Max length 100 char"})
    name: string;

    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: "Special characters are not allowed"
    })
    @MaxLength(100, {message: "Maximum 120 characters for the slug"})
    slug: string;

    @IsOptional()
    @IsInt({message: "sortOrder must be an integer"})
    @Min(0, {message: "sortOrder cannot be negative"})
    sortOrder?: number

    @IsOptional()
    @IsBoolean({message: "isActive must be an true or false"})
    isActive?: boolean
}