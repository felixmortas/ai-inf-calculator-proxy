// Opt-in deployed verification belongs in the deployment environment. This file is
// intentionally a no-op until DEPLOYED_RELAY_URL and controlled provider fixtures exist.
if (!process.env.DEPLOYED_RELAY_URL) process.exit(0);
throw new Error('Provide controlled deployed verification fixtures before enabling this command.');
