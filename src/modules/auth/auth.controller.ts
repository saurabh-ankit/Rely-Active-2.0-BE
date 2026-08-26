import type { NextFunction, Request, Response } from "express";

import { AuthService } from "./auth.service";

export class AuthController {
  private authService = new AuthService();

  public login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res
          .status(400)
          .json({ success: false, message: "Email and password are required" });
        return;
      }
      const result = await this.authService.login(email, password);
      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public seedSuperAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email, password, fullName } = req.body;
      const user = await this.authService.createSuperAdmin({
        email,
        password,
        fullName,
      });
      res.status(201).json({
        success: true,
        message: "Superadmin created successfully",
        data: { id: user.id, email: user.email, role: user.role },
      });
    } catch (error) {
      next(error);
    }
  };
}
