import { bookProducts, getBookProduct } from "../data/bookProducts"

export default function BookArtwork({
  productId,
  className = "",
  priority = false,
  compact = false,
}: {
  productId: string
  className?: string
  priority?: boolean
  compact?: boolean
}) {
  const product = getBookProduct(productId)
  const books = product.isCombo
    ? bookProducts.filter((book) => !book.isCombo)
    : [product]
  const backgrounds: Record<string, string> = {
    vehicles: "#FFF2D8",
    animals: "#EAF4E9",
    nature: "#EAF1FF",
    combo3: "#EDF2FF",
  }

  return (
    <div
      className={`book-artwork relative isolate flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: backgrounds[product.id] }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[18%] -top-[50%] -z-10 aspect-square w-[85%] rounded-full border border-white/70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[50%] -left-[15%] -z-10 aspect-square w-[85%] rounded-full bg-white/35"
      />
      {product.isCombo ? (
        <div
          className={`relative grid grid-cols-2 items-center ${
            compact
              ? "w-[80%] gap-2 py-[3%]"
              : "w-[82%] gap-x-3 gap-y-4 py-[8%]"
          }`}
        >
          {books.map((book, index) => (
            <div
              key={book.id}
              className={`book-jacket ${
                index === 0
                  ? `col-span-2 mx-auto ${compact ? "w-[58%]" : "w-[64%]"}`
                  : "w-full"
              }`}
            >
              <img
                src={book.cover}
                alt={`Bìa sách ${book.title}`}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                width={1404}
                height={993}
                className="block h-auto w-full rounded-[3px] object-contain"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="book-jacket relative w-[82%]">
          <img
            src={product.cover}
            alt={`Bìa sách ${product.title}`}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            width={1404}
            height={993}
            className="block h-auto w-full rounded-[3px] object-contain"
          />
        </div>
      )}
    </div>
  )
}
