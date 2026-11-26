import Hero from "@/components/landing/Hero";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { staticPhotos } from "@/lib/photos";

export default function Home() {
  // Only the count leaves the server: data/photos.json holds the answers.
  const photoCount = staticPhotos().length;
  return (
    <>
      <Hero photoCount={photoCount} header={<Header />} />
      <Footer className="lp-footer" />
    </>
  );
}
