import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export const PRODUCT_SORTS = [
    'newest',
    'price_asc',
    'price_desc',
    'name_asc',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ListProductsQueryDto {
    @IsOptional()
    @Matches(SLUG, { message: "The category must be a valid slug." })
    category?: string;

    @IsOptional()
    @Matches(SLUG, { message: "The brand must be a valid slug." })
    brand?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100, { message: "Max length 100 char" })
    q?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'minPrice must be an integer' })
    @Min(0, { message: 'minPrice cannot be negative' })
    minPrice?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'maxPrice must be an integer' })
    @Min(0, { message: 'maxPrice cannot be negative' })
    maxPrice?: number;

    // "true" / "false" in the URL -> boolean; anything else fails @IsBoolean
    @IsOptional()
    @Transform(({ value }) =>
        value === 'true' ? true : value === 'false' ? false : value,
    )
    @IsBoolean({ message: 'featured must be the true or false' })
    featured?: boolean;

    @IsOptional()
    @IsIn(PRODUCT_SORTS, {
        message: `sort: ${PRODUCT_SORTS.join(', ')}`,
    })
    sort: ProductSort = 'newest';

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'page must be an integer' })
    @Min(1, { message: 'page start to 1' })
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'limit must be an integer' })
    @Min(1, { message: 'limit minimun 1' })
    @Max(50, { message: 'limit maximun 50' })
    limit: number = 12;
}