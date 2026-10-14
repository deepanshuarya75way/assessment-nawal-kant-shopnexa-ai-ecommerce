import { createUserTable } from "../models/userTables.js";
import { createOrderItemTable } from "../models/orderItemsTable.js";
import { createOrdersTable } from "../models/ordersTable.js";
import { createPaymentsTable } from "../models/paymentsTable.js";
import { createProductReviewsTable } from "../models/productReviewsTable.js";
import { createProductsTable } from "../models/productTable.js";
import { createShippingInfoTable } from "../models/shippinginfoTable.js";
export const createDatabaseIndexes = async () =>{
  try{
    const indexQueries = [
      `
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_products_created_at ON
      products(created_at DESC);
      `,
      `
      CREATED INDEX IF NOT EXISTS idx_orders_id ON orders(buyer_id);`,
      `
      CREATED INDEX IF NOT EXISTS idx_order_items_order_id ON
       order_items(order_id);
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
      `,
    ]
    for(const query of indexQueries){
      await database.query(query);
    }
    console.log("Database performance index verified ");
  }catch (error) {
    console.warn("Index creation warning ", error.message);

  }
};
export const upgradeSchemaForLocationDiscounts = async () => {
  try{
    await database.query(
      `
      ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_city 
      VARCHAR(100) DEFAULT NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS
      discount_percent DECIMAL(5,2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount
      DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE  orders ADD COLUMN IF NOT EXISTS discount_details JSONB DEFAULT '[]' :: JSONB;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
      `
    );
    console.log("Location discount columns verfied ");

  } catch (error){
    console.error("Schema upgrade warning :", error.message);
  }
};
export const createTables = async () => {
  try {
    await createUserTable();
    await createProductsTable();
    await createProductReviewsTable();
    await createOrdersTable();
    await createOrderItemTable();
    await createShippingInfoTable();
    await createPaymentsTable();
    await upgradeSchemaForLocationDiscounts();
    
    console.log("All Tables Created Successfully.");
  } catch (error) {
    console.error("Error creating tables:", error);
  }
};