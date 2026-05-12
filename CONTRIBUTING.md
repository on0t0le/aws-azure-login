# Contributing

## Get started

This project is written in TypeScript and is using prettier and eslint for code formatting. You need node v18.

1. Install node v18. I recommend installing that with nvm: https://github.com/nvm-sh/nvm

```sh
nvm install 18
```

2. Make node v18 default

```sh
nvm alias default 18
```

3. Open a new terminal and verify node version (should return v18.X.X)

```sh
node -v
```

4. Install yarn

```sh
npm install -g yarn
```

5. Fork and clone project

```sh
git clone git@github.com:<GITHUB_USERNAME>/aws-azure-login.git
cd aws-azure-login
```

6. Install dependencies

```sh
yarn install
```

7a. Start dev mode

```sh
yarn start
```

7b. Start prod mode

```sh
yarn build && node ./lib/index.js
```

## Testing the Auto-Refresh Daemon

No automated tests exist for the daemon. Manual smoke test:

1. Build: `npm run build`
2. Start daemon: `node lib/index.js --daemon start`
3. Verify OS service registered:
   - macOS: `launchctl list com.aws-azure-login`
   - Linux: `systemctl --user status aws-azure-login`
4. Tail daemon log: `tail -f ~/.aws/aws-azure-login-daemon.log`
5. Check status: `node lib/index.js --daemon status`
6. Stop daemon: `node lib/index.js --daemon stop`

To test auto-rotation, set `aws_expiration` in `~/.aws/credentials` to ~12 minutes
from now for a profile. Profiles with `azure_default_remember_me = true` will attempt
a silent re-login. Profiles without it will receive an OS notification.
