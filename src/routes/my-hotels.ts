import express, { Request, Response } from "express";
import multer from "multer";
import cloudinary from "cloudinary";
import Hotel from "../models/hotel";
import verifyToken from "../middleware/auth";
import { body } from "express-validator";
import { HotelType } from "../shared/types";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

router.post(
  "/add-hotel",
  // verifyToken,
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("type").notEmpty().withMessage("Hotel type is required"),
    body("pricePerNight")
      .notEmpty()
      .isNumeric()
      .withMessage("Price per night is required and must be a number"),
    body("facilities")
      .notEmpty()
      .isArray()
      .withMessage("Facilities are required")
      .custom((value) => {
        if (!Array.isArray(value)) {
          throw new Error("Facilities must be an array");
        }
        if (value.length === 0) {
          throw new Error("At least one facility is required");
        }
        // Check that each facility is a non-empty string
        if (!value.every((item) => typeof item === "string" && item.trim().length > 0)) {
          throw new Error("Each facility must be a non-empty string");
        }
        return true;
      }),
  ],
  upload.array("imageFiles", 6),
  async (req: Request, res: Response) => {
    try {
      const imageFiles = req.files as Express.Multer.File[];
      const newHotel: HotelType = req.body;

      const imageUrls = await uploadImages(imageFiles);

      newHotel.imageUrls = imageUrls;
      newHotel.lastUpdated = new Date();
      newHotel.hotelId = req.body.hotelId;

      const hotel = new Hotel(newHotel);
      await hotel.save();

      res.status(201).send(hotel);
    } catch (e) {
      console.log(e);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const hotels = await Hotel.find({ userId: req.userId });
    res.json(hotels);
  } catch (error) {
    res.status(500).json({ message: "Error fetching hotels" });
  }
});

router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  const id = req.params.id.toString();
  try {
    // Try to find by MongoDB _id first
    let hotel = await Hotel.findOne({
      _id: id,
      userId: req.userId,
    });
    
    // If not found, try to find by hotelId
    if (!hotel) {
      hotel = await Hotel.findOne({
        hotelId: id,
        userId: req.userId,
      });
    }
    
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }
    
    res.json(hotel);
  } catch (error) {
    res.status(500).json({ message: "Error fetching hotel" });
  }
});

router.put(
  "/:hotelId",
  verifyToken,
  upload.array("imageFiles"),
  async (req: Request, res: Response) => {
    try {
      const updatedHotel: HotelType = req.body;
      updatedHotel.lastUpdated = new Date();

      // Try to find by MongoDB _id first, then by hotelId
      let hotel;
      try {
        hotel = await Hotel.findOneAndUpdate(
          {
            _id: req.params.hotelId,
            userId: req.userId,
          },
          updatedHotel,
          { new: true }
        );
      } catch (error) {
        // If _id fails, try hotelId
        hotel = await Hotel.findOneAndUpdate(
          {
            hotelId: req.params.hotelId,
            userId: req.userId,
          },
          updatedHotel,
          { new: true }
        );
      }

      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      const files = req.files as Express.Multer.File[];
      const updatedImageUrls = await uploadImages(files);

      hotel.imageUrls = [
        ...updatedImageUrls,
        ...(updatedHotel.imageUrls || []),
      ];

      await hotel.save();
      res.status(201).json(hotel);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

router.put(
  "/update-hotel/:hotelId",
  // verifyToken,
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("type").notEmpty().withMessage("Hotel type is required"),
    body("pricePerNight")
      .notEmpty()
      .isNumeric()
      .withMessage("Price per night is required and must be a number"),
    body("facilities")
      .notEmpty()
      .isArray()
      .withMessage("Facilities are required")
      .custom((value) => {
        if (!Array.isArray(value)) {
          throw new Error("Facilities must be an array");
        }
        if (value.length === 0) {
          throw new Error("At least one facility is required");
        }
        if (!value.every((item) => typeof item === "string" && item.trim().length > 0)) {
          throw new Error("Each facility must be a non-empty string");
        }
        return true;
      }),
  ],
  upload.array("imageFiles", 6),
  async (req: Request, res: Response) => {
    try {
      const hotelId = req.params.hotelId;
      const updatedFields = req.body;
      const imageFiles = req.files as Express.Multer.File[];

      // Find the existing hotel by hotelId or _id
      let existingHotel;
      try {
        existingHotel = await Hotel.findOne({ _id: hotelId });
      } catch (error) {
        existingHotel = await Hotel.findOne({ hotelId: hotelId });
      }
      
      if (!existingHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Handle image updates
      let updatedImageUrls = existingHotel.imageUrls || [];
      if (imageFiles && imageFiles.length > 0) {
        const newImageUrls = await uploadImages(imageFiles);
        updatedImageUrls = [...updatedImageUrls, ...newImageUrls];
      }

      // Prepare the update object with existing and new data
      const updatedHotel = {
        ...existingHotel.toObject(),
        ...updatedFields,
        imageUrls: updatedImageUrls,
        lastUpdated: new Date()
      };

      // Update by the same field we found it with
      const queryField = existingHotel._id.toString() === hotelId ? '_id' : 'hotelId';
      const hotel = await Hotel.findOneAndUpdate(
        { [queryField]: hotelId },
        updatedHotel,
        { new: true }
      );

      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      res.status(200).json(hotel);
    } catch (e) {
      console.log(e);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

async function uploadImages(imageFiles: Express.Multer.File[]) {
  const uploadPromises = imageFiles.map(async (image) => {
    const b64 = Buffer.from(image.buffer).toString("base64");
    let dataURI = "data:" + image.mimetype + ";base64," + b64;
    const res = await cloudinary.v2.uploader.upload(dataURI);
    return res.url;
  });

  const imageUrls = await Promise.all(uploadPromises);
  return imageUrls;
}

export default router;
