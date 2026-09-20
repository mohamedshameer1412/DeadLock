path = 'app/layout.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('openGraph: { images: ["/logo.jpg"] }, twitter: { card: "summary_large_image", images: ["/logo.jpg"] }',
              'icons: { icon: "/logo.jpg", apple: "/logo.jpg" }, openGraph: { images: ["/logo.jpg"] }, twitter: { card: "summary_large_image", images: ["/logo.jpg"] }')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
