import { ArrowRight, Check } from "lucide-react"
import { Link } from "react-router"
import { bookProducts } from "../data/bookProducts"
import BookArtwork from "./BookArtwork"

export default function BookCollection({
  selectedId,
  onSelect,
}: {
  selectedId?: string
  onSelect?: (id: string) => void
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3 lg:gap-6">
      {bookProducts
        .filter((product) => !product.isCombo)
        .map((product) => {
          const selected = selectedId === product.id
          const actionClass =
            "group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/15 px-4 py-2.5 text-sm font-bold text-primary transition hover:border-primary hover:bg-primary hover:text-white"
          return (
            <article
              key={product.id}
              className={`group flex h-full flex-col overflow-hidden rounded-[24px] border bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_38px_-18px_#374BA03b] ${
                selected
                  ? "border-primary/60 ring-2 ring-primary/10"
                  : "border-primary/10"
              }`}
            >
              <BookArtwork productId={product.id} className="aspect-[1.35]" />
              <div className="flex flex-1 flex-col px-5 pb-5 pt-5 lg:px-6 lg:pb-6">
                <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#52688C]">
                  {product.chapter} · Khám phá cùng Riko
                </p>
                <h3 className="mt-2 text-[22px] leading-7">{product.title}</h3>
                <p className="mb-6 mt-3 flex-1 text-sm font-medium leading-6 text-[#606A79]">
                  {product.description}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-5">
                  <div>
                    <p className="text-[22px] font-bold leading-none text-primary">
                      {product.price.toLocaleString("vi-VN")}đ
                    </p>
                    {product.compareAt && (
                      <p className="mt-1.5 text-xs text-[#7C8491] line-through">
                        {product.compareAt.toLocaleString("vi-VN")}đ
                      </p>
                    )}
                  </div>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(product.id)}
                      aria-label={`${
                        selected ? "Đang chọn" : "Chọn sách"
                      } ${product.title}`}
                      aria-pressed={selected}
                      className={`${actionClass} ${
                        selected
                          ? "!border-primary !bg-primary !text-white"
                          : ""
                      }`}
                    >
                      {selected ? "Đang chọn" : "Chọn sách"}
                      {selected ? (
                        <Check size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                    </button>
                  ) : (
                    <Link
                      to={`/book?product=${product.id}`}
                      aria-label={`Xem sách ${product.title}`}
                      className={actionClass}
                    >
                      Xem sách{" "}
                      <ArrowRight
                        size={15}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  )}
                </div>
              </div>
            </article>
          )
        })}
    </div>
  )
}
