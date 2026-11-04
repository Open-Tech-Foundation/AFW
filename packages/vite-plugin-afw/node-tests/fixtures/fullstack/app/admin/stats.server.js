import { query } from "@opentf/afw/server";

export const stats = query(async () => ({ users: 3 }));
