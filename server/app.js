import express from "express";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createTables } from "./utils/createTables.js";
import { errorMiddleware } from "./middlewares/errorMiddlewares.js";
import authRouter from "./router/authRoutes.js";
import productRouter from "./router/productRoutes.js";
import adminRouter from "./router/adminRoutes.js";
import orderRoutes from "./router/orderRoutes.js";
import database from "./database/db.js";
// import paymentRouter from "./router/paymentRoutes.js";

config({ path: "./config/config.env" });

const app = express();

// ✅ Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

console.log("🧩 Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);
console.log("🧩 Razorpay Key Secret:", process.env.RAZORPAY_KEY_SECRET ? "Loaded ✅" : "❌ Missing");

// ✅ Middleware setup
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ tempFileDir: "./uploads", useTempFiles: true }));

// ✅ CREATE PAYMENT ORDER (frontend calls this first)
app.post("/api/v1/payment/create", async (req, res) => {
  try {
    const { orderId, totalPrice } = req.body;

    if (!orderId || !totalPrice) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order data" });
    }

    // ✅ Razorpay requires receipt <= 40 chars
    const receipt = `order_${String(orderId).slice(0, 35)}`;

    const options = {
      amount: totalPrice * 100, // convert to paise
      currency: "INR",
      receipt,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    // ✅ Save order to DB
    await database.query(
      `INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id)
       VALUES ($1, $2, $3, $4)`,
      [orderId, "Online", "Pending", order.id]
    );

    console.log("✅ Razorpay order created:", order.id);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("💥 Razorpay Payment Error:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Payment initiation failed",
      error: error.message,
    });
  }
});

// ✅ VERIFY PAYMENT (called by frontend after Razorpay success)
app.post("/api/v1/payment/verify", express.json(), async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (expectedSign !== razorpay_signature)
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });

    // ✅ Update payment record
    const updatedPaymentStatus = "Paid";
    const paymentRes = await database.query(
      `UPDATE payments SET payment_status=$1 WHERE payment_intent_id=$2 RETURNING *`,
      [updatedPaymentStatus, razorpay_order_id]
    );

    const orderId = paymentRes.rows[0].order_id;

    await database.query(`UPDATE orders SET paid_at=NOW() WHERE id=$1`, [
      orderId,
    ]);

    // ✅ Reduce product stock
    const { rows: items } = await database.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id=$1`,
      [orderId]
    );

    for (const item of items) {
      await database.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    console.log("✅ Payment verified and stock updated for order:", orderId);
    res.json({ success: true, message: "Payment verified" });
  } catch (error) {
    console.error("Verify error:", error.message);
    res.status(500).json({ success: false });
  }
});

// ✅ Routers
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/order", orderRoutes);
// app.use("/api/v1/payment", paymentRouter);


// ✅ Table creation
createTables();

// ✅ Error middleware
app.use(errorMiddleware);

export default app;
