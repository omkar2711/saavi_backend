import express, { Request, Response } from "express";
import Hotel from "../models/hotel";
import { BookingType, HotelSearchResponse } from "../shared/types";
import { param, validationResult } from "express-validator";
import Stripe from "stripe";
import verifyToken from "../middleware/auth";

const stripe = new Stripe(process.env.STRIPE_API_KEY as string);

const router = express.Router();

router.post(
  "/changePrice",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const hotelId = req.body.hotelId;
      const newPrice = req.body.newPrice;

      const hotel = await Hotel.findOneAndUpdate(
          { userId: hotelId },
        { pricePerNight: newPrice }
      );

      if (!hotel) {
        return res.status(400).json({ message: "hotel not found" });
      }

      await hotel.save();
      res.status(200).send();
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "something went wrong" });
    }
  }
);

export default router;