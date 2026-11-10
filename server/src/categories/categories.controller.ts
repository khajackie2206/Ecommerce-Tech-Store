import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CategoriesService, type UpdateCategoryInput, type CreateCategoryInput } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    // GET api/v1/categories
    @Get()
    findAll() {
        return this.categoriesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.categoriesService.findOne(id);
    }

    @Post()
    create(@Body() body: CreateCategoryInput) {
        return this.categoriesService.create(body);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id:number, @Body() body: UpdateCategoryInput ) {
        return this.categoriesService.update(id, body);
    }

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.categoriesService.remove(id);
    }
}
