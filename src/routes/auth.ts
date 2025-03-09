import express, { Request, Response } from "express";
import { check, validationResult } from "express-validator";
import User from "../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import verifyToken from "../middleware/auth";

const router = express.Router();

// Validation middleware
const loginValidationRules = [
  check("email", "Email is required").isEmail(),
  check("password", "Password with 6 or more characters required").isLength({
    min: 6,
  }),
];

// Shared authentication function
const authenticateUser = async (
  email: string,
  password: string,
  requireAdmin: boolean = false
) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Invalid Credentials");
  }

  if (requireAdmin && user.role !== "admin") {
    throw new Error("Access denied. Admin only.");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Invalid Credentials");
  }

  const tokenPayload = {
    userId: user._id,
    ...(requireAdmin && { isAdmin: true }),
  };

  const token = jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET_KEY as string,
    {
      expiresIn: "1d",
    }
  );

  return { token, userId: user._id };
};

// Shared response handler
const handleAuthResponse = (res: Response, token: string, userId: string) => {
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 86400000,
  });
  res.status(200).json({ userId });
};

router.post("/login", loginValidationRules, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const { token, userId } = await authenticateUser(email, password);
    handleAuthResponse(res, token, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    const status = message === "Invalid Credentials" ? 400 : 500;
    res.status(status).json({ message });
  }
});

router.post("/admin/login", loginValidationRules, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const { token, userId } = await authenticateUser(email, password, true);
    handleAuthResponse(res, token, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    const status = message === "Access denied. Admin only." ? 403 : 
                  message === "Invalid Credentials" ? 400 : 500;
    res.status(status).json({ message });
  }
});

router.get("/validate-token", verifyToken, (req: Request, res: Response) => {
  res.status(200).send({ userId: req.userId });
});

router.post("/logout", (req: Request, res: Response) => {
  res.cookie("auth_token", "", {
    expires: new Date(0),
  });
  res.send();
});

export default router;
