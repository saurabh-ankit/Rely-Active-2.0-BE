import type { NextFunction, Request, Response } from "express";

import { CompanyService } from "./company.service";

export class CompanyController {
  private companyService = new CompanyService();

  public getProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profile = await this.companyService.getProfileByTenant(
        req.tenantId!
      );
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  };

  public updateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const profile = await this.companyService.upsertProfile(
        req.tenantId!,
        req.body
      );
      res
        .status(200)
        .json({
          success: true,
          message: "Company profile saved successfully",
          data: profile,
        });
    } catch (error) {
      next(error);
    }
  };

  // Called by FE onboarding wizard to check if setup is done
  public checkSetupStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const exists = await this.companyService.profileExists(req.tenantId!);
      res
        .status(200)
        .json({ success: true, data: { isSetupComplete: exists } });
    } catch (error) {
      next(error);
    }
  };
}
