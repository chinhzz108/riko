# RikoKid deployment

The frontend is a static Vite app for Cloudflare Pages at
`https://rikokid.pages.dev`. Appwrite provides Auth, TablesDB, and Storage. The
browser SDK uses only public project/resource IDs; do not add an Appwrite API
key to a `VITE_*` variable or to this repository.

## Appwrite resources

The current Appwrite project is `6ac3aa2f00166baf9535` in the FRA region. The
database and tables have been created in its console:

| Resource | ID |
| --- | --- |
| Database — Rikokid Content | `6acfa9960034613b2b16` |
| Orders table | `6acfa9ab00235695e522` |
| Videos table | `6acfa9b9001328339d1b` |
| Quizzes table | `6acfa9bf00239602e8ff` |
| Media bucket | `6acfaa0500376f5fea5c` |
| Admin team | `6acfa9e9001c51f872c3` |

Create these columns in each table. Use the exact column IDs; the app sends these
names in its SDK requests.

### Orders

| Column ID | Type | Required |
| --- | --- | --- |
| `customerName` | String | Yes |
| `phone` | String | Yes |
| `email` | String | Yes |
| `province` | String | Yes |
| `address` | Long text | Yes |
| `quantity` | Integer | Yes |
| `total` | Integer | Yes |
| `orderCode` | String | Yes |
| `status` | String | Yes |

Enable row security. Give the `Any` role **Create** only. Give the
`Rikokid Admins` team **Create**, **Read**, **Update**, and **Delete**. Each
order row is created with admin-team-only read, update, and delete permissions.
New preorder rows use the existing `status` value `Đặt trước`. Their product
SKU (`vehicles`, `animals`, `nature`, or `combo3`) is appended to `orderCode`,
so the current Appwrite table schema does not need another column.

### Videos

| Column ID | Type | Required |
| --- | --- | --- |
| `title` | String | Yes |
| `description` | Long text | No |
| `chapter` | String | Yes |
| `duration` | String | Yes |
| `visibility` | String | Yes |
| `videoFileId` | String | Yes |
| `thumbnailFileId` | String | No |

Enable row security. Give the admin team **Create**, **Read**, **Update**, and
**Delete**. Public read is assigned on each video row: published videos appear
in the catalogue; `Chỉ qua đường dẫn` videos are omitted from the catalogue but
can still open when their QR/link is known.

### Quizzes

| Column ID | Type | Required |
| --- | --- | --- |
| `title` | String | Yes |
| `chapter` | String | Yes |
| `videoId` | String | No |
| `published` | Boolean | Yes |
| `questions` | Long text | Yes |

The `questions` value is a JSON array. Enable row security. Give the admin team
**Create**, **Read**, **Update**, and **Delete**. Published quiz rows receive
public read permissions individually; drafts stay private to admins.

### Auth team and Storage

Create an Auth team named `Rikokid Admins`. Add only the people who should
manage customer orders and content. The app accepts a login only when the user
belongs to this team. The `/recovery` page lets an administrator request a
password-reset email and lets them set the new password from Appwrite's link.
An account created without a password can use this flow to set its first one.

Create a Storage bucket named `Rikokid Media`, enable file security, and grant
the admin team **Create**, **Read**, **Update**, and **Delete** at bucket level.
Also grant `Any` **Read** at bucket level: with file security enabled, Appwrite
requires both bucket and file permissions. The app assigns `Any` **Read** to
each uploaded video and thumbnail file, so only files attached to a content row
that the app makes public can be viewed. Keep file security enabled. Copy the
generated team and bucket IDs into `.env.local`.

## Build and Cloudflare Pages

The GitHub Actions workflow builds on pull requests and deploys to Cloudflare
Pages when commits reach `main`. It copies `.env.example` into the CI
environment before building, so Appwrite's public endpoint and resource IDs are
embedded in the static bundle.

1. In Cloudflare Pages, create a project named `rikokid` with **Direct Upload**.
   The included `_redirects` file supports React Router paths.
2. In GitHub repository **Settings → Secrets and variables → Actions**, add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Create a Cloudflare API
   token with **Account → Cloudflare Pages → Edit** permission. Keep the token
   in GitHub Secrets; never put it in `.env.example` or a `VITE_*` variable.
3. Push to `main`, or run the **Build and deploy** workflow manually on `main`.
   Pull requests build the site without deploying it.
4. When any `VITE_APPWRITE_*` value changes, update `.env.example` and push the
   change; the next workflow run embeds those public values in the new build.
5. In Appwrite project **Apps**, register the Pages hostname
   `rikokid.pages.dev`. For local development, register `localhost` (hostname
   only; this permits every local port, including `8443`). Register your custom
   hostname too if one is connected. Password-recovery links redirect back to
   `/recovery`, so that hostname must be registered as a Web platform.
6. Create an Appwrite Auth user for each administrator and add that user to the
   `Rikokid Admins` team. No admin account is created through the public site.

Orders are COD submissions. Card payments and payment-provider webhooks are
not configured.
