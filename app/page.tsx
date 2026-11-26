import Hero from "@/components/landing/Hero";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";

export default function Home() {
  return (
    <Hero header={<Header />} footer={<Footer className="lp-footer" waves={false} solid={false} />} />
  );
}
