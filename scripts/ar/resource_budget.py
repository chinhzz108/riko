"""Keep offline video QA usable on the owner's everyday laptop.

Imported before numpy/OpenCV: two logical CPUs, low process priority, one BLAS
and OpenCV worker. Child FFmpeg processes inherit the affinity on Windows.
"""
import os

for name in ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"]:
    os.environ[name] = "1"
os.environ.setdefault("NODE_OPTIONS", "--max-old-space-size=768")
os.environ.setdefault("RAYON_NUM_THREADS", "2")

if os.name == "nt":
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.SetProcessAffinityMask.argtypes = [wintypes.HANDLE, ctypes.c_size_t]
    kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    handle = kernel.GetCurrentProcess()
    if not kernel.SetProcessAffinityMask(handle, 3):
        raise OSError(ctypes.get_last_error(), "Cannot apply two-CPU media budget")
    if not kernel.SetPriorityClass(handle, 0x40):
        raise OSError(ctypes.get_last_error(), "Cannot set idle media priority")
elif hasattr(os, "sched_getaffinity"):
    os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:2])
    os.nice(10)
