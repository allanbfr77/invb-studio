# Página do link de "Compartilhar" (Vercel)

Site estático publicado no projeto **nv-cortes** da Vercel (`https://nv-cortes.vercel.app`).
O link de um corte é `https://nv-cortes.vercel.app/v/<código>`: a página lê o título e o vídeo do Vercel Blob
(store `nv-cortes`), para onde o Studio envia o corte ao clicar em Compartilhar (`lib/cloud-share.js`).

Para publicar de novo depois de mudar algo aqui: na pasta `vercel/`, `npx vercel --prod` (projeto nv-cortes).
