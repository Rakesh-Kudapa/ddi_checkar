import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Next.js does NOT add this automatically — without it, mobile
          browsers render the page at a virtual desktop-width viewport and
          shrink everything, which is what made the deployed app look
          "clumsy" on phones (forced pinch-zoom, tiny unreadable text). */}
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
