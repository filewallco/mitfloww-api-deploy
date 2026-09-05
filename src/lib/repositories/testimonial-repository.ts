import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  testimonials,
  testimonialRevisions,
} from "@/lib/db/schema";
import type {
  TestimonialRecord,
  NewTestimonialRecord,
  TestimonialRevisionRecord,
  NewTestimonialRevisionRecord,
} from "@/lib/db/schema/testimonials";

export type UpdateTestimonialInput = Partial<Omit<NewTestimonialRecord, "id">>;

export interface TestimonialRepository {
  create(input: NewTestimonialRecord): Promise<TestimonialRecord>;
  findById(id: string): Promise<TestimonialRecord | null>;
  listAll(options?: { userId?: string }): Promise<TestimonialRecord[]>;
  update(id: string, input: UpdateTestimonialInput): Promise<TestimonialRecord | null>;
  softDelete(id: string): Promise<boolean>;
  createRevision(input: NewTestimonialRevisionRecord): Promise<TestimonialRevisionRecord>;
}

export class DrizzleTestimonialRepository implements TestimonialRepository {
  async create(input: NewTestimonialRecord): Promise<TestimonialRecord> {
    const result = await db.insert(testimonials).values(input).returning();
    return result[0];
  }

  async findById(id: string): Promise<TestimonialRecord | null> {
    const result = await db
      .select()
      .from(testimonials)
      .where(and(eq(testimonials.id, id), isNull(testimonials.deletedAt)));
    return result[0] ?? null;
  }

  async listAll(options?: { userId?: string }): Promise<TestimonialRecord[]> {
    const conditions = [isNull(testimonials.deletedAt)];

    if (options?.userId) {
      conditions.push(eq(testimonials.userId, options.userId));
    }

    return db
      .select()
      .from(testimonials)
      .where(and(...conditions))
      .orderBy(desc(testimonials.updatedAt));
  }

  async update(id: string, input: UpdateTestimonialInput): Promise<TestimonialRecord | null> {
    const result = await db
      .update(testimonials)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(testimonials.id, id), isNull(testimonials.deletedAt)))
      .returning();
    return result[0] ?? null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await db
      .update(testimonials)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(testimonials.id, id), isNull(testimonials.deletedAt)))
      .returning({ id: testimonials.id });
    return result.length > 0;
  }

  async createRevision(input: NewTestimonialRevisionRecord): Promise<TestimonialRevisionRecord> {
    const result = await db.insert(testimonialRevisions).values(input).returning();
    return result[0];
  }
}
