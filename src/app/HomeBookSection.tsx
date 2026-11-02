import { ArrowRight, BookOpen, Check, Package } from "lucide-react"
import { Link } from "react-router"
import BookCollection from "./BookCollection"

export default function HomeBookSection() {
  return (
    <section
      className="mx-auto max-w-[1240px] px-4 pb-16 pt-5 sm:px-6 lg:px-10"
      aria-labelledby="home-books-title"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#667896]">
            Tủ sách đầu tiên của nhà thám hiểm nhỏ
          </p>
          <h2
            id="home-books-title"
            className="mt-3 text-3xl leading-tight tracking-[-.035em] sm:text-[40px]"
          >
            Ba quyển sách nhỏ.
            <br />
            <span className="text-[#D75A3D]">Cả thế giới khám phá.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-[#606A79]">
            Từ những bánh xe chuyển động đến muôn loài và thiên nhiên kỳ thú.
            Chọn một chủ đề bé yêu thích, để Riko đồng hành cùng con.
          </p>
        </div>
        <Link
          to="/book"
          className="group inline-flex items-center gap-2 border-b border-primary/25 pb-1 text-sm font-bold text-primary transition hover:border-primary"
        >
          Khám phá tủ sách{" "}
          <ArrowRight
            size={17}
            className="transition-transform group-hover:translate-x-1"
          />
        </Link>
      </div>

      <BookCollection />

      <div className="relative mt-6 overflow-hidden rounded-[24px] bg-[#374BA0] px-6 py-7 sm:px-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-44 right-5 size-72 rounded-full border border-white/10"
        />
        <div className="relative flex items-start gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#FBAF37] sm:flex">
            <Package size={29} strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#FBD48D]">
              Trọn bộ khám phá cùng Riko
            </p>
            <h3 className="mt-2 text-xl leading-tight text-white sm:text-2xl">
              Ba chủ đề. Thêm nhiều điều mới.
            </h3>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/75">
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-[#FBD48D]" /> Đủ 3 quyển
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-[#FBD48D]" /> Tiết kiệm 98.000đ
              </span>
              <Link
                to="/preview"
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <BookOpen size={14} className="text-[#FBD48D]" /> Đọc thử
              </Link>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-5 border-t border-white/15 pt-5 lg:mt-0 lg:shrink-0 lg:border-0 lg:pt-0">
          <div>
            <p className="text-3xl font-bold leading-none tracking-tight text-white">
              799.000đ
            </p>
            <p className="mt-2 text-xs font-medium text-white/60">
              Combo 3 quyển
            </p>
          </div>
          <Link
            to="/book?product=combo3"
            className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#FBAF37] px-5 py-3 text-sm font-bold text-[#293D79] transition hover:-translate-y-0.5 hover:bg-[#FFC567]"
          >
            Chọn trọn bộ{" "}
            <ArrowRight
              size={17}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
