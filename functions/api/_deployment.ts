/**
 * Fixed at source level: this deployment is the public landing application.
 * Never selected by a request or environment flag.
 *
 * There are no authenticated routes and no sessions here; the center
 * application owns its own deployment, roles and session store.
 */
export const APPLICATION = 'landing' as const;
