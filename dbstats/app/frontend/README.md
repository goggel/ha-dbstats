# DBstats frontend

Each horizontal count chart has a **Select / copy category labels** disclosure
below it. Open it to select and copy the full original category labels (one per
line), including labels shortened in the graph. The read-only text field supports
keyboard selection and native copy commands, with horizontal scrolling for long
labels. It requires no clipboard API or HTTPS connection.

Forked from [this repo](https://github.com/bloomui/tokyo-free-white-react-admin-dashboard.git).

## Quick Start

* Make sure you have the latest stable versions for Node.js and NPM installed. NVM usage recommended.
* Clone repository
* Build shared library: `cd shared && npm ci && npm run build`
* Install dependencies: Run `npm ci` inside the project folder
* Start dev server: After the installation finishes, run `npm start`. A browser window will open on http://localhost:3004 where you''ll see the live preview
* Backend service is expected to be on http://localhost:3000
