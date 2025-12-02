"use client";

import { motion } from "framer-motion";
import { Globe, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchingIndicatorProps {
  className?: string;
}

export function SearchingIndicator({ className }: SearchingIndicatorProps) {
  // Animated dots for "Searching..."
  const dots = [".", ".", "."];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br from-background via-background to-muted/30 p-4 shadow-sm",
        className
      )}
    >
      {/* Animated gradient beam effect */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
        animate={{
          x: ["-100%", "200%"],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-4">
        {/* Animated icon container */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          {/* Pulsing ring */}
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/20"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Icon background */}
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {/* Rotating globe */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <Globe className="h-5 w-5 text-primary" />
            </motion.div>
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">
              Searching the web
              {/* Animated dots */}
              {dots.map((dot, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                >
                  {dot}
                </motion.span>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Finding relevant sources to enhance the response
          </p>
        </div>

        {/* Sparkle animation */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 15, -15, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Sparkles className="h-4 w-4 text-primary/60" />
        </motion.div>
      </div>

      {/* Progress bar effect at bottom */}
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-primary/50 via-primary to-primary/50"
          animate={{
            x: ["-100%", "400%"],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </motion.div>
  );
}
