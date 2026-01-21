# FLUX.2 [klein] Demo

A minimal web demo for [FLUX.2 Klein](https://blackforestlabs.ai) image generation by Black Forest Labs.

## Features

- Text-to-image generation with FLUX.2 Klein (9B and 4B variants)
- Image-to-image generation using reference images

This demo is intended as a starting point for developers exploring the [BFL API](https://docs.bfl.ai). Fork it and build something cool!

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:4321 in your browser

4. Enter your BFL API key (get one at https://dashboard.bfl.ai/get-started)

## Deployment

Deploy to Vercel:

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

## Tech Stack

- [Astro](https://astro.build) - Web framework
- [BFL API](https://docs.bfl.ai) - Image generation

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
