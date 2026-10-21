# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy))
and the Bestway clouds and apps (report to Bestway).

The e-mail and password of each Bestway account are kept by Gladys as
integration settings (the password as a secret, never shown again) and sent
only to the Bestway cloud of the chosen region, over HTTPS. The integration
never logs them. Its `/data` volume keeps the session token of each account
(to avoid logging in at every restart: the clouds limit logins), a hash of the
e-mail and region it belongs to, and the last 12 hours of water temperatures.

Anyone holding the token can control the spa until it expires: protect the
backups of the Gladys data like the password itself.
