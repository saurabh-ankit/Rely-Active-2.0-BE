import { AppDataSource } from "../../config/db";
import { CompanyProfile } from "../../entities/company-profile.entity";
import { AppError } from "../../utils/appError";

const repo = () => AppDataSource.getRepository(CompanyProfile);

export class CompanyService {
  public async getProfileByTenant(tenantId: string): Promise<CompanyProfile> {
    const profile = await repo().findOne({ where: { tenantId } });
    if (!profile) {
      throw AppError.notFound(
        `Company profile for tenant [${tenantId}] not found`
      );
    }
    return profile;
  }

  public async upsertProfile(
    tenantId: string,
    data: Partial<CompanyProfile>
  ): Promise<CompanyProfile> {
    const profile = await repo().findOne({ where: { tenantId } });
    if (profile) {
      Object.assign(profile, data);
      return await repo().save(profile);
    }
    const newProfile = repo().create({
      ...(data as object),
      tenantId,
    } as CompanyProfile);
    return await repo().save(newProfile);
  }

  public async profileExists(tenantId: string): Promise<boolean> {
    const count = await repo().count({ where: { tenantId } });
    return count > 0;
  }
}
