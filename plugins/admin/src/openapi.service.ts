/**
 * The OpenAPI key/school surface, over the tables this plugin owns.
 *
 * `api_keys` and `schools` had no owner before P4.3b.14 - the boot schema created them and this
 * console was their only reader and writer in the entire repository. They are declared in the
 * plugin's `data.adopted`, so the SQL here is ownership-checked like every other plugin statement.
 *
 * Kept as its own class (rather than folded into the repository) because the controller injects it
 * by token, exactly as it did before the migration.
 */

import type { AdminRepository } from './admin.types.js';

export class OpenApiService {
  constructor(private readonly repository: AdminRepository) {}

  listKeys() {
    return this.repository.listApiKeys();
  }

  createKey(input: Record<string, unknown>) {
    return this.repository.createApiKey(input);
  }

  deleteKey(id: string) {
    this.repository.deleteApiKey(id);
  }

  listSchools() {
    return this.repository.listSchools();
  }

  createSchool(input: Record<string, unknown>) {
    return this.repository.createSchool(input);
  }

  updateSchool(id: string, input: Record<string, unknown>) {
    return this.repository.updateSchool(id, input);
  }

  deleteSchool(id: string) {
    return this.repository.deleteSchool(id);
  }
}
