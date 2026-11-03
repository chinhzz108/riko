import { ArrowLeft, ArrowUpRight, BookOpen, Camera, ScanLine, Sparkles } from "lucide-react"
import { Link } from "react-router"
import rikoWelcome from "../assets/riko/welcome.webp"
import rikoLogo from "../assets/rikokid-logo-transparent.webp"

export default function ARScanIntro({ onStart, starting, error }: { onStart: () => void; starting: boolean; error?: string }) {
  return (
    <div className="ar-intro">
      <header className="ar-intro-header">
        <Link to="/" aria-label="RikoKid — Trang chủ" className="ar-intro-logo">
          <img src={rikoLogo} alt="" width="144" height="82" />
        </Link>
        <Link to="/book" className="ar-intro-back">
          <ArrowLeft size={17} aria-hidden="true" /> Tủ sách của Riko
        </Link>
      </header>

      <section className="ar-intro-content" aria-labelledby="ar-intro-title">
        <div className="ar-intro-grid">
          <div className="ar-intro-copy">
            <p className="ar-intro-eyebrow"><span /> KHÁM PHÁ CÙNG RIKO</p>
            <h1 id="ar-intro-title">Mở trang sách.<br /><span>Gặp thế giới mới.</span></h1>
            <p className="ar-intro-description">Đưa hình popup hoặc trang sách trước camera.<br className="hidden sm:block" /> Cùng Riko khám phá những điều kỳ diệu!</p>
          </div>

          <div className="ar-intro-art" aria-hidden="true">
            <div className="ar-intro-orbit" />
            <div className="ar-intro-spark ar-intro-spark-one"><Sparkles /></div>
            <div className="ar-intro-spark ar-intro-spark-two"><Sparkles /></div>
            <span className="ar-intro-dot ar-intro-dot-one" />
            <span className="ar-intro-dot ar-intro-dot-two" />
            <span className="ar-intro-corner ar-intro-corner-tl" />
            <span className="ar-intro-corner ar-intro-corner-tr" />
            <span className="ar-intro-corner ar-intro-corner-bl" />
            <span className="ar-intro-corner ar-intro-corner-br" />
            <svg className="ar-intro-book" viewBox="0 0 500 230" fill="none">
              <ellipse cx="250" cy="194" rx="187" ry="17" fill="#264F6320" />
              <path d="M40 98 235 132 250 183 265 132 460 98 442 178 250 211 58 178Z" fill="#374BA0" />
              <path d="M50 80Q145 48 250 111 355 48 450 80L438 167Q340 154 250 195 160 154 62 167Z" fill="#FFFDF2" stroke="#D5D8C8" strokeWidth="2" />
              <path d="M250 111V195" stroke="#D1D7C7" strokeWidth="3" />
              <path d="M76 101Q153 79 222 119M72 119Q153 99 222 137M71 138Q149 119 221 154M279 119Q347 79 424 101M279 137Q347 99 428 119M279 154Q351 119 429 138" stroke="#DEE5D7" strokeWidth="4" strokeLinecap="round" />
              <path d="M92 91Q153 83 202 103L201 130Q146 109 89 119Z" fill="#C4DDAC" />
              <path d="M297 104Q350 83 410 91L413 119Q354 109 298 130Z" fill="#CCE6F2" />
            </svg>
            <img className="ar-intro-riko" src={rikoWelcome} alt="" width="178" height="316" fetchPriority="high" />
            <span className="ar-intro-art-label"><ScanLine size={16} /> RIKO AR</span>
          </div>

          <div className="ar-intro-actions">
            <button type="button" onClick={onStart} disabled={starting} className="ar-intro-start">
              <Camera size={21} aria-hidden="true" />
              {starting ? "Đang mở camera…" : "Bắt đầu quét"}
              <ArrowUpRight size={20} aria-hidden="true" />
            </button>
            <p>Không cần tải ứng dụng. Chỉ cần một chút tò mò.</p>
            {error && <div role="alert" className="ar-intro-error">{error}</div>}
          </div>
        </div>

        <ol className="ar-intro-steps" aria-label="Cách trải nghiệm AR">
          <li><span className="ar-intro-step-icon"><Camera size={22} /></span><div><span>01</span><p>Cho phép camera</p></div></li>
          <li><span className="ar-intro-step-icon"><BookOpen size={22} /></span><div><span>02</span><p>Đưa hình vào khung</p></div></li>
          <li><span className="ar-intro-step-icon"><Sparkles size={22} /></span><div><span>03</span><p>Khám phá thôi!</p></div></li>
        </ol>
      </section>
    </div>
  )
}
