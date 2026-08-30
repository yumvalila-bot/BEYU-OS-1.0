import { Injectable } from "@nestjs/common";

/**
 * Canonical user identity for BEYU Health OS (Phase 1). In production this is
 * backed by Supabase Auth + the `profiles` table (or an equivalent user store).
 * The repository abstraction keeps the auth service testable without a live DB
 * and isolates the storage backend from business logic.
 */
export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  /** bcrypt hash (never the plaintext). */
  passwordHash: string;
  role: string;
  tenantId: string;
  organizationId?: string;
  licenceNumber?: string | null;
  active: boolean;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  passwordHash: string;
  role: string;
  tenantId: string;
  organizationId?: string;
  licenceNumber?: string | null;
}

export abstract class UserRepository {
  abstract findById(id: string): Promise<UserAccount | null>;
  abstract findByEmail(email: string): Promise<UserAccount | null>;
  abstract create(input: CreateUserInput): Promise<UserAccount>;
}

/**
 * In-memory repository used for tests and local/dev runtimes. Not suitable for
 * production persistence — swap for a TypeORM/Supabase implementation via the
 * same interface.
 */
@Injectable()
export class InMemoryUserRepository extends UserRepository {
  private readonly rows: UserAccount[] = [];

  async findById(id: string): Promise<UserAccount | null> {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const normalized = email.trim().toLowerCase();
    return this.rows.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserAccount> {
    const user: UserAccount = {
      id: `user_${this.rows.length + 1}`,
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      role: input.role,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      licenceNumber: input.licenceNumber ?? null,
      active: true,
      createdAt: new Date(),
    };
    this.rows.push(user);
    return user;
  }
}
