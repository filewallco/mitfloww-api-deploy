import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  fileVersions,
  files,
  projectClientReviews,
  projects,
  type ProjectClientReviewRecord,
  type ProjectRecord,
} from "@/lib/db/schema";
import { buildContainsSearchPattern } from "@/lib/query/search";
import type {
  ProjectListRepositoryQuery,
  ProjectSortField,
} from "@/lib/query/projects";
import type { SortOrder } from "@/lib/query/sorting";

export type CreateProjectRecordInput = Omit<
  ProjectRecord,
  "createdAt" | "deletedAt" | "updatedAt" | "id"
> &
  Partial<Pick<ProjectRecord, "id">>;

export type UpdateProjectRecordInput = Partial<
  Omit<CreateProjectRecordInput, "id">
> & {
  updatedAt?: Date;
};



export type FindProjectByCanonicalIdentityInput = {
  clientName: string;
  excludeId?: string;
  title: string;
};

export type FindManyProjectsParams = ProjectListRepositoryQuery & {
  includeDeleted?: boolean;
};

export type FindManyProjectsResult = {
  records: ProjectRecord[];
  total: number | null;
};

import { ProjectPaymentStatus } from "@/lib/dto/projects";

export interface ProjectRepository {
  create(input: CreateProjectRecordInput): Promise<ProjectRecord>;
  findActiveByCanonicalTitleAndClientName(
    input: FindProjectByCanonicalIdentityInput,
  ): Promise<ProjectRecord | null>;
  findByIdentifier(
    identifier: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null>;
  findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null>;
  findByPublicId(
    publicId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null>;
  findByShareToken(
    shareToken: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null>;
  findManyPaginated(
    params: FindManyProjectsParams,
  ): Promise<FindManyProjectsResult>;
  findClientReviewByProjectId(projectId: string): Promise<ProjectClientReviewRecord | null>;
  upsertClientReview(input: {
    projectId: string;
    rating: number;
    reviewText: string;
    sourceLocale: string;
    submittedAt: Date;
    updatedAt: Date;
  }): Promise<ProjectClientReviewRecord>;
  softDelete(id: string, deletedAt: Date): Promise<ProjectRecord | null>;
  hardDelete(id: string): Promise<ProjectRecord | null>;
  update(id: string, input: UpdateProjectRecordInput): Promise<ProjectRecord | null>;
  countPaidProjects(): Promise<number>;
  getFreelancerStats(): Promise<{ averageRating: number; totalReviews: number }>;
  findPaidProjectsWithReviews(): Promise<Array<{ project: ProjectRecord; review: ProjectClientReviewRecord }>>;
}

const projectColumns = getTableColumns(projects);
const projectFileMetrics = db
  .select({
    fileCount: sql<number>`cast(count(distinct ${files.id}) as int)`,
    projectId: files.projectId,
    totalSizeBytes: sql<number>`cast(coalesce(sum(coalesce(${fileVersions.sizeBytes}, ${files.sizeBytes})), 0) as bigint)`,
  })
  .from(files)
  .leftJoin(
    fileVersions,
    and(eq(fileVersions.fileId, files.id), isNull(fileVersions.deletedAt)),
  )
  .where(isNull(files.deletedAt))
  .groupBy(files.projectId)
  .as("project_file_metrics");

function getSortColumn(sortField: ProjectSortField) {
  switch (sortField) {
    case "createdAt":
      return projects.createdAt;
    case "title":
      return projects.title;
    case "clientName":
      return projects.clientName;
    case "amountCents":
      return projects.amountCents;
    case "fileCount":
      return sql<number>`coalesce(${projectFileMetrics.fileCount}, 0)`;
    case "totalSizeBytes":
      return sql<number>`coalesce(${projectFileMetrics.totalSizeBytes}, 0)`;
    case "updatedAt":
    default:
      return projects.updatedAt;
  }
}

function getOrderExpression(sortField: ProjectSortField, order: SortOrder) {
  const orderBy = order === "asc" ? asc : desc;

  if (sortField === "updatedAt") {
    return [
      orderBy(projects.updatedAt),
      orderBy(projects.createdAt),
      orderBy(projects.id),
    ] as const;
  }

  return [orderBy(getSortColumn(sortField)), orderBy(projects.id)] as const;
}

function canonicalizeProjectIdentityPart(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export class DrizzleProjectRepository implements ProjectRepository {
  async create(input: CreateProjectRecordInput): Promise<ProjectRecord> {
    const [record] = await db.insert(projects).values(input).returning();

    if (!record) {
      throw new Error("Failed to create project record.");
    }

    return record;
  }

  async findActiveByCanonicalTitleAndClientName(
    input: FindProjectByCanonicalIdentityInput,
  ): Promise<ProjectRecord | null> {
    const conditions = [
      isNull(projects.deletedAt),
      sql`lower(regexp_replace(btrim(${projects.title}), '[[:space:]]+', ' ', 'g')) = ${canonicalizeProjectIdentityPart(input.title)}`,
      sql`lower(regexp_replace(btrim(${projects.clientName}), '[[:space:]]+', ' ', 'g')) = ${canonicalizeProjectIdentityPart(input.clientName)}`,
    ];

    if (input.excludeId) {
      conditions.push(sql`${projects.id} <> ${input.excludeId}`);
    }

    const [record] = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .limit(1);

    return record ?? null;
  }

  async findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null> {
    if (!isUuidLike(id)) {
      return null;
    }

    const whereClause = options?.includeDeleted
      ? eq(projects.id, id)
      : and(eq(projects.id, id), isNull(projects.deletedAt));

    const [record] = await db
      .select()
      .from(projects)
      .where(whereClause)
      .limit(1);

    return record ?? null;
  }

  async findByPublicId(
    publicId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null> {
    const whereClause = options?.includeDeleted
      ? eq(projects.publicId, publicId)
      : and(eq(projects.publicId, publicId), isNull(projects.deletedAt));

    const [record] = await db
      .select()
      .from(projects)
      .where(whereClause)
      .limit(1);

    return record ?? null;
  }

  async findByShareToken(
    shareToken: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null> {
    const whereClause = options?.includeDeleted
      ? eq(projects.shareToken, shareToken)
      : and(eq(projects.shareToken, shareToken), isNull(projects.deletedAt));

    const [record] = await db
      .select()
      .from(projects)
      .where(whereClause)
      .limit(1);

    return record ?? null;
  }

  async findByIdentifier(
    identifier: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ProjectRecord | null> {
    if (isUuidLike(identifier)) {
      return this.findById(identifier, options);
    }

    return this.findByPublicId(identifier, options);
  }

  async findManyPaginated(
    params: FindManyProjectsParams,
  ): Promise<FindManyProjectsResult> {
    const conditions: SQL[] = [];

    if (!params.includeDeleted) {
      conditions.push(isNull(projects.deletedAt));
    }

    if (params.paymentStatus !== undefined) {
      conditions.push(eq(projects.paymentStatus, params.paymentStatus));
    }

    if (params.hasDeliverables) {
      conditions.push(sql`coalesce(${projectFileMetrics.fileCount}, 0) > 0`);
    }

    if (params.search !== undefined) {
      const searchPattern = buildContainsSearchPattern(params.search);
      const searchCondition = or(
        ilike(projects.title, searchPattern),
        ilike(projects.clientName, searchPattern),
        ilike(projects.clientEmail, searchPattern),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = getOrderExpression(params.sort, params.order);

    const recordsQuery = db
      .select(projectColumns)
      .from(projects)
      .leftJoin(projectFileMetrics, eq(projectFileMetrics.projectId, projects.id))
      .orderBy(...orderBy)
      .limit(params.limit)
      .offset(params.offset);

    const recordsPromise = whereClause
      ? recordsQuery.where(whereClause)
      : recordsQuery;

    if (params.includeTotal === false) {
      const records = await recordsPromise;

      return {
        records,
        total: null,
      };
    }

    const totalQuery = db
      .select({
        count: count(),
      })
      .from(projects)
      .leftJoin(projectFileMetrics, eq(projectFileMetrics.projectId, projects.id));

    const [records, totalResult] = await Promise.all([
      recordsPromise,
      whereClause ? totalQuery.where(whereClause) : totalQuery,
    ]);

    return {
      records,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  async softDelete(id: string, deletedAt: Date): Promise<ProjectRecord | null> {
    const [record] = await db
      .update(projects)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning();

    return record ?? null;
  }

  async hardDelete(id: string): Promise<ProjectRecord | null> {
    const [record] = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning();

    return record ?? null;
  }

  async findClientReviewByProjectId(
    projectId: string,
  ): Promise<ProjectClientReviewRecord | null> {
    const [record] = await db
      .select()
      .from(projectClientReviews)
      .where(eq(projectClientReviews.projectId, projectId))
      .limit(1);

    return record ?? null;
  }

  async upsertClientReview(input: {
    projectId: string;
    rating: number;
    reviewText: string;
    sourceLocale: string;
    submittedAt: Date;
    updatedAt: Date;
  }): Promise<ProjectClientReviewRecord> {
    const [record] = await db
      .insert(projectClientReviews)
      .values({
        projectId: input.projectId,
        rating: input.rating,
        reviewText: input.reviewText,
        sourceLocale: input.sourceLocale,
        submittedAt: input.submittedAt,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: projectClientReviews.projectId,
        set: {
          rating: input.rating,
          reviewText: input.reviewText,
          sourceLocale: input.sourceLocale,
          submittedAt: input.submittedAt,
          updatedAt: input.updatedAt,
        },
      })
      .returning();

    if (!record) {
      throw new Error("Failed to upsert project client review.");
    }

    return record;
  }

  async update(
    id: string,
    input: UpdateProjectRecordInput,
  ): Promise<ProjectRecord | null> {
    const [record] = await db
      .update(projects)
      .set(input)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning();

    return record ?? null;
  }

  async countPaidProjects(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(projects)
      .where(
        and(
          isNull(projects.deletedAt),
          eq(projects.paymentStatus, ProjectPaymentStatus.Paid),
        ),
      );

    return result?.count ?? 0;
  }

  async findPaidProjectsWithReviews() {
    const results = await db
      .select({
        project: projects,
        review: projectClientReviews,
      })
      .from(projects)
      .innerJoin(projectClientReviews, eq(projects.id, projectClientReviews.projectId))
      .where(
        and(
          eq(projects.paymentStatus, "paid"),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(desc(projectClientReviews.submittedAt));

    return results;
  }

  async getFreelancerStats(): Promise<{ averageRating: number; totalReviews: number }> {
    const records = await db
      .select({
        rating: projectClientReviews.rating,
      })
      .from(projectClientReviews);

    const totalReviews = records.length;
    const averageRating = totalReviews > 0
      ? Number((records.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
      : 0;

    return {
      averageRating,
      totalReviews,
    };
  }
}
