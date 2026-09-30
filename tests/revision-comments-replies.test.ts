import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db } from "../src/lib/db/client";
import {
  projects,
  files,
  fileVersions,
  revisionComments,
  revisionCommentReplies,
  users,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { DrizzleFileRevisionNoteRepository } from "../src/lib/repositories/file-revision-note-repository";
import { FileRevisionNoteService } from "../src/lib/services/file-revision-note-service";
import { DrizzleFileRepository } from "../src/lib/repositories/file-repository";
import { DrizzleProjectRepository } from "../src/lib/repositories/project-repository";

test("File Review Comments & Replies: End-to-end multi-level nesting, speed, auth, and deletion", async () => {
  let testUser: any = null;
  let testProject: any = null;
  let testFile: any = null;
  let testVersion: any = null;

  try {
    const repository = new DrizzleFileRevisionNoteRepository();
    const fileRepo = new DrizzleFileRepository();
    const projectRepo = new DrizzleProjectRepository();

    let sentEmails: any[] = [];
    const mockEmailService: any = {
      sendRevisionNoteCommentEmail: async (input: any) => {
        sentEmails.push({ type: "comment", ...input });
        return { error: null, status: "sent" };
      },
      sendRevisionNoteReplyEmail: async (input: any) => {
        sentEmails.push({ type: "reply", ...input });
        return { error: null, status: "sent" };
      },
    };

    const service = new FileRevisionNoteService(
      fileRepo,
      projectRepo,
      repository,
      mockEmailService,
    );

    // Setup test user, project, file, fileVersion
    const [u] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: `test-creator-${Date.now()}@example.com`,
        passwordHash: "hash123",
        displayName: "Test Creator",
      })
      .returning();
    testUser = u;

    const [p] = await db
      .insert(projects)
      .values({
        userId: testUser.id,
        publicId: `test-review-${Date.now()}`,
        title: "Test Review Project",
        clientEmail: "client@review.com",
        clientName: "Client Alice",
        shareClientEmail: "client@review.com",
        amountCents: 0,
      })
      .returning();
    testProject = p;

    const [f] = await db
      .insert(files)
      .values({
        projectId: testProject.id,
        name: "sample-design.png",
        originalName: "sample-design.png",
        extension: "png",
        mimeType: "image/png",
        sizeBytes: 1024,
        storageKey: `test/key/${Date.now()}`,
        storageBucket: "files",
      })
      .returning();
    testFile = f;

    const [v] = await db
      .insert(fileVersions)
      .values({
        fileId: testFile.id,
        revisionNumber: 1,
        originalName: "sample-design.png",
        extension: "png",
        mimeType: "image/png",
        sizeBytes: 1024,
        storageKey: `test/v1/key/${Date.now()}`,
        storageBucket: "files",
      })
      .returning();
    testVersion = v;

    await db
      .update(files)
      .set({ currentVersionId: testVersion.id })
      .where(eq(files.id, testFile.id));

    // 1. Client creates comment with visual markers (annotations)
    sentEmails = [];
    const clientComment = await service.createClientFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      note: "Please adjust button contrast",
      sourceLocale: "en",
      viewerLocale: "en",
      markers: [{ height: 0.1, width: 0.1, x: 0.2, y: 0.3 }],
    });

    assert.ok(clientComment.id);
    assert.equal(clientComment.body, "Please adjust button contrast");
    assert.equal(clientComment.createdBy, "client");
    // Issue 10: Stop sending email per comment/reply; digests handled by scheduler
    assert.equal(sentEmails.length, 0);

    // 2. Creator creates level 1 reply (speed test: must return immediately)
    sentEmails = [];
    const startReply1 = Date.now();
    const reply1Result = await service.replyToFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      noteId: clientComment.id,
      reply: "Got it, updating the blue shade now.",
      sourceLocale: "en",
      viewerLocale: "en",
      authorRole: "creator",
    });
    const reply1Duration = Date.now() - startReply1;
    assert.ok(reply1Duration < 1000, `Reply creation took ${reply1Duration}ms, must be <1000ms`);
    assert.equal(reply1Result.note.replies.length, 1);
    const reply1 = reply1Result.note.replies[0];
    assert.equal(reply1.body, "Got it, updating the blue shade now.");
    assert.equal(reply1.parentReplyId, null);
    // Issue 10: Stop sending email per comment/reply
    assert.equal(sentEmails.length, 0);

    // 3. Client creates level 2 reply to level 1 reply (Reply to reply)
    const reply2Result = await service.replyToFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      noteId: clientComment.id,
      reply: "Thanks! Can you also check the hover state?",
      parentReplyId: reply1.id,
      sourceLocale: "en",
      viewerLocale: "en",
      authorRole: "client",
    });
    assert.equal(reply2Result.note.replies.length, 2);
    const reply2 = reply2Result.note.replies[1];
    assert.equal(reply2.body, "Thanks! Can you also check the hover state?");
    assert.equal(reply2.parentReplyId, reply1.id);
    assert.equal(reply2.createdBy, "client");

    // 4. Creator creates level 3 reply to level 2 reply (Unlimited nesting)
    const reply3Result = await service.replyToFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      noteId: clientComment.id,
      reply: "Hover state updated as well.",
      parentReplyId: reply2.id,
      sourceLocale: "en",
      viewerLocale: "en",
      authorRole: "creator",
    });
    assert.equal(reply3Result.note.replies.length, 3);
    const reply3 = reply3Result.note.replies[2];
    assert.equal(reply3.parentReplyId, reply2.id);

    // 5. Security & Authorization: Cannot forge parentReplyId across comments
    const otherComment = await service.createFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      note: "Unrelated comment",
      sourceLocale: "en",
      viewerLocale: "en",
    });
    await assert.rejects(
      async () => {
        await service.replyToFileRevisionNote({
          fileId: testFile.id,
          fileVersionId: testVersion.id,
          noteId: otherComment.id,
          reply: "Attempting thread injection",
          parentReplyId: reply1.id,
          sourceLocale: "en",
          viewerLocale: "en",
          authorRole: "creator",
        });
      },
      /parentReplyId does not belong to this comment thread/
    );

    // 6. Security & Authorization: Client cannot delete creator's reply
    await assert.rejects(
      async () => {
        await service.deleteFileRevisionNoteReply({
          fileId: testFile.id,
          fileVersionId: testVersion.id,
          noteId: clientComment.id,
          replyId: reply1.id,
          authorRole: "client",
          viewerLocale: "en",
        });
      },
      /Clients can only delete their own replies/
    );

    // 7. Security & Authorization: Creator cannot delete client's reply
    await assert.rejects(
      async () => {
        await service.deleteFileRevisionNoteReply({
          fileId: testFile.id,
          fileVersionId: testVersion.id,
          noteId: clientComment.id,
          replyId: reply2.id,
          authorRole: "creator",
          viewerLocale: "en",
        });
      },
      /You cannot delete client replies/
    );

    // 8. Delete reply and verify immediate re-reply capability
    const deleteResult = await service.deleteFileRevisionNoteReply({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      noteId: clientComment.id,
      replyId: reply3.id,
      authorRole: "creator",
      viewerLocale: "en",
    });
    assert.equal(deleteResult.note.replies.length, 2);
    assert.ok(!deleteResult.note.replies.some((r) => r.id === reply3.id));

    // Can immediately create another reply without issue
    const newReply = await service.replyToFileRevisionNote({
      fileId: testFile.id,
      fileVersionId: testVersion.id,
      noteId: clientComment.id,
      reply: "Fresh reply after deletion",
      sourceLocale: "en",
      viewerLocale: "en",
      authorRole: "creator",
    });
    assert.equal(newReply.note.replies.length, 3);
    assert.ok(newReply.note.replies.some((r) => r.body === "Fresh reply after deletion"));

    console.log("All File Review Comments & Replies test assertions passed successfully!");
  } catch (err) {
    console.error("TEST FAILED WITH ERROR:", err);
    throw err;
  } finally {
    // Cleanup test records
    try {
      if (testFile?.id) await db.delete(files).where(eq(files.id, testFile.id));
      if (testProject?.id) await db.delete(projects).where(eq(projects.id, testProject.id));
      if (testUser?.id) await db.delete(users).where(eq(users.id, testUser.id));
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
  }
});
