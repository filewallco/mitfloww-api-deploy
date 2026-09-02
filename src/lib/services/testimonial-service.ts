import { DrizzleTestimonialRepository, type TestimonialRepository, type UpdateTestimonialInput } from "@/lib/repositories/testimonial-repository";
import type { NewTestimonialRecord } from "@/lib/db/schema/testimonials";
import { NotFoundAppError } from "@/lib/errors/app-error";

export class TestimonialService {
  constructor(private readonly repository: TestimonialRepository) {}

  async createTestimonial(input: NewTestimonialRecord) {
    return this.repository.create(input);
  }

  async getTestimonialById(id: string) {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundAppError("Testimonial not found.");
    }
    return record;
  }

  async updateTestimonial(id: string, input: UpdateTestimonialInput) {
    const record = await this.repository.update(id, input);
    if (!record) {
      throw new NotFoundAppError("Testimonial not found.");
    }
    return record;
  }
}

export const testimonialService = new TestimonialService(new DrizzleTestimonialRepository());
