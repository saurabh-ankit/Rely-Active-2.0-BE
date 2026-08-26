import type { NextFunction, Request, Response } from "express";

import { PropertyService } from "./property.service";

export class PropertyController {
  private service = new PropertyService();

  public createProperty = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const property = await this.service.createProperty(
        req.tenantId!,
        req.user!.userId,
        req.body
      );
      res.status(201).json({
        success: true,
        message: "Property created successfully",
        data: property,
      });
    } catch (error) {
      next(error);
    }
  };

  public getProperties = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const properties = await this.service.getPropertiesByTenant(
        req.tenantId!
      );
      res.status(200).json({
        success: true,
        data: properties,
      });
    } catch (error) {
      next(error);
    }
  };

  public getDashboardStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const propertyId = req.query.propertyId as string | undefined;
      const stats = await this.service.getDashboardStats(
        req.tenantId!,
        propertyId
      );
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  public getPropertyById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const propertyId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const property = await this.service.getPropertyById(
        req.tenantId!,
        propertyId
      );
      res.status(200).json({
        success: true,
        data: property,
      });
    } catch (error) {
      next(error);
    }
  };

  public addUnit = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const propertyId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const unit = await this.service.createUnit(
        req.tenantId!,
        propertyId,
        req.body
      );
      res.status(201).json({
        success: true,
        message: "Unit added to property successfully",
        data: unit,
      });
    } catch (error) {
      next(error);
    }
  };

  public addBulkUnits = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const propertyId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const units = await this.service.createBulkUnits(
        req.tenantId!,
        propertyId,
        req.body.units || req.body
      );
      res.status(201).json({
        success: true,
        message: `${units.length} unit(s) created in property successfully`,
        data: units,
      });
    } catch (error) {
      next(error);
    }
  };
}
