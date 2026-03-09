#!/usr/bin/env python3
"""
🚫 Guardian Blocker Overlay — Écran de blocage plein écran
Affiche un message d'avertissement en plein écran avec fond flou
quand un contenu interdit est détecté.
"""
import tkinter as tk
import subprocess
import sys
import os

def show_block_screen(child_name="Weedleay", keyword="", auto_close_seconds=15):
    """Affiche un écran de blocage plein écran style contrôle parental."""
    
    root = tk.Tk()
    root.attributes('-fullscreen', True)
    root.attributes('-topmost', True)
    root.configure(bg='#0a0a0a')
    root.overrideredirect(True)
    
    # Empêcher la fermeture par Alt+F4 ou touches
    root.protocol("WM_DELETE_WINDOW", lambda: None)
    root.bind("<Escape>", lambda e: None)
    root.bind("<Alt-F4>", lambda e: None)
    
    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    
    # Canvas principal
    canvas = tk.Canvas(root, width=screen_w, height=screen_h, bg='#0a0a0a', highlightthickness=0)
    canvas.pack(fill='both', expand=True)
    
    # Fond dégradé sombre avec effet
    for i in range(screen_h // 2):
        r = int(10 + (30 * i / (screen_h // 2)))
        color = f'#{r:02x}0505'
        canvas.create_line(0, i, screen_w, i, fill=color)
    for i in range(screen_h // 2, screen_h):
        r = int(40 - (30 * (i - screen_h // 2) / (screen_h // 2)))
        color = f'#{r:02x}0505'
        canvas.create_line(0, i, screen_w, i, fill=color)
    
    # Cercle rouge pulsant au centre (icône stop)
    cx, cy = screen_w // 2, screen_h // 2 - 80
    canvas.create_oval(cx-80, cy-80, cx+80, cy+80, fill='#dc2626', outline='#ef4444', width=4)
    
    # Icône X dans le cercle
    canvas.create_line(cx-30, cy-30, cx+30, cy+30, fill='white', width=8, capstyle='round')
    canvas.create_line(cx+30, cy-30, cx-30, cy+30, fill='white', width=8, capstyle='round')
    
    # Texte principal — GROS et ROUGE
    canvas.create_text(
        screen_w // 2, cy + 130,
        text=f"{child_name},",
        font=("Ubuntu", 52, "bold"),
        fill="#ef4444",
        anchor="center"
    )
    
    canvas.create_text(
        screen_w // 2, cy + 200,
        text="tu n'as pas le droit",
        font=("Ubuntu", 44, "bold"),
        fill="#ffffff",
        anchor="center"
    )
    
    canvas.create_text(
        screen_w // 2, cy + 260,
        text="de regarder cette vidéo !",
        font=("Ubuntu", 44, "bold"),
        fill="#ffffff",
        anchor="center"
    )
    
    # Sous-texte
    if keyword:
        canvas.create_text(
            screen_w // 2, cy + 340,
            text=f"Contenu bloqué : « {keyword} »",
            font=("Ubuntu", 18),
            fill="#f87171",
            anchor="center"
        )
    
    canvas.create_text(
        screen_w // 2, cy + 400,
        text="Demande à tes parents si tu veux y accéder.",
        font=("Ubuntu", 20),
        fill="#a1a1aa",
        anchor="center"
    )
    
    # Compte à rebours
    countdown_text = canvas.create_text(
        screen_w // 2, screen_h - 60,
        text=f"Cet écran disparaîtra dans {auto_close_seconds} secondes",
        font=("Ubuntu", 14),
        fill="#52525b",
        anchor="center"
    )
    
    # Bande rouge en haut et en bas
    canvas.create_rectangle(0, 0, screen_w, 6, fill='#dc2626', outline='')
    canvas.create_rectangle(0, screen_h-6, screen_w, screen_h, fill='#dc2626', outline='')
    
    # Petits textes "GUARDIAN" répétés en haut
    for x in range(0, screen_w, 200):
        canvas.create_text(x + 100, 25, text="🛡️ GUARDIAN", font=("Ubuntu", 10, "bold"), fill="#3f3f46")
    
    # Animation du compte à rebours
    remaining = [auto_close_seconds]
    
    def update_countdown():
        remaining[0] -= 1
        if remaining[0] <= 0:
            root.destroy()
            return
        canvas.itemconfig(countdown_text, 
            text=f"Cet écran disparaîtra dans {remaining[0]} secondes")
        root.after(1000, update_countdown)
    
    root.after(1000, update_countdown)
    
    # Focus forcé
    root.focus_force()
    root.lift()
    
    try:
        root.mainloop()
    except:
        pass


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "Weedleay"
    keyword = sys.argv[2] if len(sys.argv) > 2 else ""
    duration = int(sys.argv[3]) if len(sys.argv) > 3 else 15
    show_block_screen(name, keyword, duration)
