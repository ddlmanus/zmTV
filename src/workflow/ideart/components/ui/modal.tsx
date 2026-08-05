"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    title?: string
    variant?: 'dark' | 'light'
    className?: string
    placement?: 'center' | 'left'
}

export function Modal({ isOpen, onClose, children, title, variant = 'dark', className = '', placement = 'center' }: ModalProps) {
    if (!isOpen) return null

    const isDark = variant === 'dark'
    const opensFromLeft = placement === 'left'

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    />
                    <div className={opensFromLeft
                        ? "pointer-events-none fixed inset-y-0 left-[72px] right-0 z-50 flex items-start justify-start p-3"
                        : "fixed inset-0 z-50 flex items-center justify-center p-4"}>
                        <motion.div
                            initial={opensFromLeft ? { opacity: 0, x: -12 } : { opacity: 0, scale: 0.95, y: 20 }}
                            animate={opensFromLeft ? { opacity: 1, x: 0 } : { opacity: 1, scale: 1, y: 0 }}
                            exit={opensFromLeft ? { opacity: 0, x: -12 } : { opacity: 0, scale: 0.95, y: 20 }}
                            className={`pointer-events-auto relative w-full ${opensFromLeft ? '' : 'max-w-lg'} rounded-xl p-5 shadow-2xl ${isDark
                                    ? 'bg-[#121212] border border-white/10'
                                    : 'bg-white border border-gray-100'
                                } ${className}`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                {title && (
                                    <h2 className={`text-[16px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {title}
                                    </h2>
                                )}
                                <button
                                    onClick={onClose}
                                    className={`rounded-full p-2 transition-colors ${isDark
                                            ? 'hover:bg-white/10 text-gray-400'
                                            : 'hover:bg-gray-100 text-gray-500'
                                        }`}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {children}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}
