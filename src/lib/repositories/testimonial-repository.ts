import { and, eq, isNull } from "drizzle-orm";
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
  update(id: string, input: UpdateTestimonialInput): Promise<TestimonialRecord | null>;
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

  async update(id: string, input: UpdateTestimonialInput): Promise<TestimonialRecord | null> {
    console.log("[TRACE] Database lookup id:", id);
    const result = await db
      .update(testimonials)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(testimonials.id, id), isNull(testimonials.deletedAt)))
      .returning();
    console.log("[TRACE] Rows returned:", result.length);
    return result[0] ?? null;
  }

  async createRevision(input: NewTestimonialRevisionRecord): Promise<TestimonialRevisionRecord> {
    const result = await db.insert(testimonialRevisions).values(input).returning();
    return result[0];
  }
}
