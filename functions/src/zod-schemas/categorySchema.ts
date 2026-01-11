import { object, string, number, array } from "zod";

export const categorySchema = object({
  categoryName: string()
    .min(1, { message: "Category name is required" })
    .trim(),
  displayOrder: number()
    .min(0, { message: "Display order cannot be negative" })
    .optional(),
  color: string().trim().optional(),
});

export const categoryUpdateSchema = categorySchema.partial();

export const assignCategoryToProductsSchema = object({
  productIds: array(string().min(1, { message: "Product ID is required" })).min(
    1,
    { message: "At least one product ID is required" }
  ),
});
