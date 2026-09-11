import { DrizzleTestimonialRepository, type TestimonialRepository, type UpdateTestimonialInput } from "@/lib/repositories/testimonial-repository";
import type { NewTestimonialRecord } from "@/lib/db/schema/testimonials";
import { NotFoundAppError } from "@/lib/errors/app-error";

export class TestimonialService {
  constructor(private readonly repository: TestimonialRepository) {}

  async createTestimonial(input: NewTestimonialRecord) {
    return this.repository.create(input);
  }

  async listTestimonials(userId?: string) {
    return this.repository.listAll(userId ? { userId } : undefined);
  }

  async getTestimonialById(id: string, userId?: string) {
    const record = await this.repository.findById(id);
    if (!record || (userId && record.userId !== userId)) {
      throw new NotFoundAppError("Testimonial not found.");
    }
    return record;
  }

  async updateTestimonial(id: string, input: UpdateTestimonialInput, userId?: string) {
    if (userId) {
      const record = await this.repository.findById(id);
      if (!record || record.userId !== userId) {
        throw new NotFoundAppError("Testimonial not found.");
      }
    }
    const record = await this.repository.update(id, input);
    if (!record) {
      throw new NotFoundAppError("Testimonial not found.");
    }
    return record;
  }

  async deleteTestimonial(id: string, userId?: string) {
    if (userId) {
      const record = await this.repository.findById(id);
      if (!record || record.userId !== userId) {
        throw new NotFoundAppError("Testimonial not found.");
      }
    }
    const deleted = await this.repository.softDelete(id);
    if (!deleted) {
      throw new NotFoundAppError("Testimonial not found.");
    }
  }
}

export const testimonialService = new TestimonialService(new DrizzleTestimonialRepository());
